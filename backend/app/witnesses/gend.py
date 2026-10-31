"""GenD deepfake-face detector (Yermakov, Cech, Matas, Fritz: "Deepfake Detection that Generalizes Across Benchmarks",
WACV 2026). CLIP ViT-L/14 with only its LayerNorms tuned, an L2-normalised linear head, two classes.

Vendored from https://huggingface.co/yermandy/GenD_CLIP_L_14 (modeling_gend.py, MIT licence), CLIP and Perception
Encoder backbones, so it loads from backend/models_hf/ without the upstream repository or remote code.
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from transformers import PretrainedConfig, PreTrainedModel


class LinearProbe(nn.Module):
    def __init__(self, input_dim, num_classes, normalize_inputs=False):
        super().__init__()
        self.linear = nn.Linear(input_dim, num_classes)
        self.normalize_inputs = normalize_inputs

    def forward(self, x: torch.Tensor, **kwargs):
        if self.normalize_inputs:
            x = F.normalize(x, p=2, dim=1)
        return self.linear(x)


class CLIPEncoder(nn.Module):
    def __init__(self, model_name="openai/clip-vit-large-patch14"):
        super().__init__()
        from transformers import CLIPImageProcessor, CLIPVisionConfig, CLIPVisionModelWithProjection

        self._preprocess = CLIPImageProcessor.from_pretrained(model_name)
        # architecture only: the GenD checkpoint carries every vision weight (LayerNorms tuned), so CLIP's own
        # 1.7 GB weights are never needed
        clip = CLIPVisionModelWithProjection(CLIPVisionConfig.from_pretrained(model_name))
        self.vision_model = clip.vision_model
        self.visual_projection = clip.visual_projection
        self.features_dim = self.vision_model.config.hidden_size

    def preprocess(self, image: Image.Image) -> torch.Tensor:
        return self._preprocess(images=image, return_tensors="pt")["pixel_values"][0]

    def forward(self, preprocessed_images: torch.Tensor) -> torch.Tensor:
        return self.vision_model(preprocessed_images).pooler_output

    def get_features_dim(self):
        return self.features_dim


class PerceptionEncoder(nn.Module):
    """Meta Perception Encoder (PE-core L/14) via timm; weights come from the GenD checkpoint, not timm's hub."""

    def __init__(self, model_name="vit_pe_core_large_patch14_336"):
        super().__init__()
        import timm

        self.backbone = timm.create_model(model_name, pretrained=False, dynamic_img_size=True)
        data_config = timm.data.resolve_model_data_config(self.backbone)
        data_config["input_size"] = (3, 224, 224)
        self._preprocess = timm.data.create_transform(**data_config, is_training=False)
        self.backbone.head = nn.Identity()
        self.features_dim = self.backbone.num_features

    def preprocess(self, image: Image.Image) -> torch.Tensor:
        return self._preprocess(image)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.backbone(inputs)

    def get_features_dim(self):
        return self.features_dim


class GenDConfig(PretrainedConfig):
    model_type = "GenD"

    def __init__(self, backbone: str = "openai/clip-vit-large-patch14", head: str = "linear", **kwargs):
        super().__init__(**kwargs)
        self.backbone = backbone
        self.head = head


class GenD(PreTrainedModel):
    config_class = GenDConfig

    def __init__(self, config):
        super().__init__(config)
        if "vit_pe" in config.backbone.lower():
            self.feature_extractor = PerceptionEncoder(config.backbone)
        else:
            self.feature_extractor = CLIPEncoder(config.backbone)
        dim = self.feature_extractor.get_features_dim()
        self.model = LinearProbe(dim, 2, normalize_inputs=config.head == "LinearNorm")

    def forward(self, inputs: torch.Tensor):
        return self.model(self.feature_extractor(inputs))
