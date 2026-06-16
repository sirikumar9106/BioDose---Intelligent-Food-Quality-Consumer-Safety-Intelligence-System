import torch
from shadow_trainer import AttentionModelBase

def run_inference(model: AttentionModelBase, features: torch.Tensor) -> float:
    """
    Runs inference on the provided features using the loaded PyTorch model.
    
    Args:
        model (AttentionModelBase): The loaded PyTorch model.
        features (torch.Tensor): Feature tensor of shape (seq_len, batch_size, embed_dim).
        
    Returns:
        float: The predicted risk score.
    """
    model.eval()
    with torch.no_grad():
        out = model(features)
        return out.item()
