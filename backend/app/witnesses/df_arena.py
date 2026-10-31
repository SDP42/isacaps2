"""DF Arena 500M anti-spoofing model (Speech-Arena-2025/DF_Arena_500M_V_1, arXiv 2603.06164).

XLS-R 300M self-supervised front end; every hidden layer is attention-pooled, gated by a learned sigmoid, summed, and
passed to a 4-block Conformer with a class token and a two-way head (index 0 spoof, 1 bona fide).

Vendored and reviewed from the model repository (backbone.py, conformer.py, modeling_antispoofing.py) so it runs
without `trust_remote_code`: the XLS-R config is inlined instead of fetched, einops is replaced by transposes, and the
forward pass accepts a batch. Input: 16 kHz waveform, 64,600 samples (4.04 s), not normalised.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn.modules.transformer import _get_clones
from transformers import Wav2Vec2Config, Wav2Vec2Model

N_SAMPLES = 64600

XLSR_300M = dict(  # facebook/wav2vec2-xls-r-300m config.json (architecture fields)
    conv_bias=True, conv_dim=[512] * 7, conv_kernel=[10, 3, 3, 3, 3, 2, 2], conv_stride=[5, 2, 2, 2, 2, 2, 2],
    do_stable_layer_norm=True, feat_extract_activation="gelu", feat_extract_norm="layer", hidden_act="gelu",
    hidden_size=1024, intermediate_size=4096, layer_norm_eps=1e-5, num_attention_heads=16,
    num_conv_pos_embedding_groups=16, num_conv_pos_embeddings=128, num_feat_extract_layers=7, num_hidden_layers=24,
    apply_spec_augment=False, layerdrop=0.0, hidden_dropout=0.0, attention_dropout=0.0, activation_dropout=0.0,
    feat_proj_dropout=0.0,
)


def calc_same_padding(kernel_size):
    pad = kernel_size // 2
    return (pad, pad - (kernel_size + 1) % 2)


class Swish(nn.Module):
    def forward(self, x):
        return x * x.sigmoid()


class GLU(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.dim = dim

    def forward(self, x):
        out, gate = x.chunk(2, dim=self.dim)
        return out * gate.sigmoid()


class Transpose(nn.Module):  # einops Rearrange('b n c -> b c n') and back
    def forward(self, x):
        return x.transpose(1, 2)


class DepthWiseConv1d(nn.Module):
    def __init__(self, chan_in, chan_out, kernel_size, padding):
        super().__init__()
        self.padding = padding
        self.conv = nn.Conv1d(chan_in, chan_out, kernel_size, groups=chan_in)

    def forward(self, x):
        return self.conv(F.pad(x, self.padding))


class Scale(nn.Module):
    def __init__(self, scale, fn):
        super().__init__()
        self.fn = fn
        self.scale = scale

    def forward(self, x, **kwargs):
        return self.fn(x, **kwargs) * self.scale


class PreNorm(nn.Module):
    def __init__(self, dim, fn):
        super().__init__()
        self.fn = fn
        self.norm = nn.LayerNorm(dim)

    def forward(self, x, **kwargs):
        return self.fn(self.norm(x), **kwargs)


class Attention(nn.Module):
    """Head-token attention (arXiv 2210.05958)."""

    def __init__(self, dim, heads=8, dim_head=64, qkv_bias=False, dropout=0.0, proj_drop=0.0):
        super().__init__()
        self.num_heads = heads
        inner_dim = dim_head * heads
        self.scale = dim_head**-0.5
        self.qkv = nn.Linear(dim, inner_dim * 3, bias=qkv_bias)
        self.attn_drop = nn.Dropout(dropout)
        self.proj = nn.Linear(inner_dim, dim)
        self.proj_drop = nn.Dropout(proj_drop)
        self.act = nn.GELU()
        self.ht_proj = nn.Linear(dim_head, dim, bias=True)
        self.ht_norm = nn.LayerNorm(dim_head)
        self.pos_embed = nn.Parameter(torch.zeros(1, self.num_heads, dim))

    def forward(self, x, mask=None):
        B, N, C = x.shape
        head_pos = self.pos_embed.expand(x.shape[0], -1, -1)
        x_ = x.reshape(B, -1, self.num_heads, C // self.num_heads).permute(0, 2, 1, 3).mean(dim=2)
        x_ = self.ht_proj(x_).reshape(B, -1, self.num_heads, C // self.num_heads)
        x_ = self.act(self.ht_norm(x_)).flatten(2) + head_pos
        x = torch.cat([x, x_], dim=1)
        qkv = self.qkv(x).reshape(B, N + self.num_heads, 3, self.num_heads, C // self.num_heads).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]
        attn = ((q @ k.transpose(-2, -1)) * self.scale).softmax(dim=-1)
        x = self.proj((attn @ v).transpose(1, 2).reshape(B, N + self.num_heads, C))
        cls, patch, ht = torch.split(x, [1, N - 1, self.num_heads], dim=1)
        cls = cls + torch.mean(ht, dim=1, keepdim=True) + torch.mean(patch, dim=1, keepdim=True)
        return self.proj_drop(torch.cat([cls, patch], dim=1)), attn


class FeedForward(nn.Module):
    def __init__(self, dim, mult=4, dropout=0.0):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(dim, dim * mult), Swish(), nn.Dropout(dropout), nn.Linear(dim * mult, dim),
                                 nn.Dropout(dropout))

    def forward(self, x):
        return self.net(x)


class ConformerConvModule(nn.Module):
    def __init__(self, dim, causal=False, expansion_factor=2, kernel_size=31, dropout=0.0):
        super().__init__()
        inner_dim = dim * expansion_factor
        padding = calc_same_padding(kernel_size) if not causal else (kernel_size - 1, 0)
        self.net = nn.Sequential(
            nn.LayerNorm(dim), Transpose(), nn.Conv1d(dim, inner_dim * 2, 1), GLU(dim=1),
            DepthWiseConv1d(inner_dim, inner_dim, kernel_size=kernel_size, padding=padding),
            nn.BatchNorm1d(inner_dim) if not causal else nn.Identity(), Swish(), nn.Conv1d(inner_dim, dim, 1),
            Transpose(), nn.Dropout(dropout),
        )

    def forward(self, x):
        return self.net(x)


class ConformerBlock(nn.Module):
    def __init__(self, *, dim, dim_head=64, heads=8, ff_mult=4, conv_expansion_factor=2, conv_kernel_size=31):
        super().__init__()
        self.ff1 = Scale(0.5, PreNorm(dim, FeedForward(dim=dim, mult=ff_mult)))
        self.attn = PreNorm(dim, Attention(dim=dim, dim_head=dim_head, heads=heads))
        self.conv = ConformerConvModule(dim=dim, expansion_factor=conv_expansion_factor, kernel_size=conv_kernel_size)
        self.ff2 = Scale(0.5, PreNorm(dim, FeedForward(dim=dim, mult=ff_mult)))
        self.post_norm = nn.LayerNorm(dim)

    def forward(self, x, mask=None):
        x = self.ff1(x) + x
        attn_x, attn_weight = self.attn(x, mask=mask)
        x = attn_x + x
        x = self.conv(x) + x
        x = self.ff2(x) + x
        return self.post_norm(x), attn_weight


def sinusoidal_embedding(n_channels, dim):
    pe = torch.FloatTensor([[p / (10000 ** (2 * (i // 2) / dim)) for i in range(dim)] for p in range(n_channels)])
    pe[:, 0::2] = torch.sin(pe[:, 0::2])
    pe[:, 1::2] = torch.cos(pe[:, 1::2])
    return pe.unsqueeze(0)


class FinalConformer(nn.Module):
    def __init__(self, emb_size=128, heads=4, ffmult=4, exp_fac=2, kernel_size=16, n_encoders=1):
        super().__init__()
        self.positional_emb = nn.Parameter(sinusoidal_embedding(10000, emb_size), requires_grad=False)
        self.encoder_blocks = _get_clones(ConformerBlock(dim=emb_size, dim_head=int(emb_size / heads), heads=heads,
                                                         ff_mult=ffmult, conv_expansion_factor=exp_fac,
                                                         conv_kernel_size=kernel_size), n_encoders)
        self.class_token = nn.Parameter(torch.rand(1, emb_size))
        self.fc5 = nn.Linear(emb_size, 2)

    def forward(self, x):
        x = x + self.positional_emb[:, : x.size(1), :]
        x = torch.stack([torch.vstack((self.class_token, x[i])) for i in range(len(x))])
        for layer in self.encoder_blocks:
            x, _ = layer(x)
        return self.fc5(x[:, 0, :])


class DFArenaBackbone(nn.Module):
    def __init__(self):
        super().__init__()
        self.ssl_model = Wav2Vec2Model(Wav2Vec2Config(**XLSR_300M))
        self.ssl_model.config.output_hidden_states = True
        self.first_bn = nn.BatchNorm2d(num_features=1)
        self.selu = nn.SELU(inplace=True)
        self.fc0 = nn.Linear(1024, 1)
        self.sig = nn.Sigmoid()
        self.conformer = FinalConformer(emb_size=1024, heads=4, ffmult=4, exp_fac=2, kernel_size=31, n_encoders=4)
        self.attn_scores = nn.Linear(1024, 1, bias=False)

    def _pool(self, x):
        weights = torch.softmax(self.attn_scores(x), dim=1)
        return torch.sum(weights * x, dim=1, keepdim=True)

    def forward(self, x):
        if x.dim() == 1:
            x = x.unsqueeze(0)
        hidden = self.ssl_model(x, output_hidden_states=True).hidden_states
        pooled = torch.cat([self._pool(h) for h in hidden], dim=1)  # (B, L, D)
        full = torch.cat([h.unsqueeze(1) for h in hidden], dim=1)  # (B, L, T, D)
        gate = self.sig(self.fc0(pooled))
        gate = gate.view(gate.shape[0], gate.shape[1], gate.shape[2], -1)
        full = torch.sum(full * gate, 1).unsqueeze(dim=1)
        full = self.selu(self.first_bn(full))
        return self.conformer(full.squeeze(1))


class DFArena(nn.Module):
    """State-dict compatible with the published checkpoint (keys start with `backbone.`)."""

    def __init__(self):
        super().__init__()
        self.backbone = DFArenaBackbone()

    def forward(self, x):
        return self.backbone(x)


def load(path: str) -> DFArena:
    m = DFArena()
    sd = torch.load(path, map_location="cpu", weights_only=True)
    missing, unexpected = m.load_state_dict(sd, strict=False)
    if missing or unexpected:
        raise RuntimeError(f"DF_Arena checkpoint mismatch: missing {missing[:4]}, unexpected {unexpected[:4]}")
    return m.eval()


def pad(x, n: int = N_SAMPLES):
    """The model's own preprocessing: first 4.04 s, tiled when shorter."""
    import numpy as np

    if len(x) >= n:
        return x[:n]
    return np.tile(x, int(n / len(x)) + 1)[:n]
