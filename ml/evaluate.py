import torch
import torch.nn as nn
from shadow_trainer import AttentionModelBase, ShadowModelB

def evaluate_model(model: nn.Module, X_val: list, Y_val: list) -> float:
    """
    Evaluates the model on the validation set using Mean Absolute Error.
    
    Args:
        model (nn.Module): The PyTorch model to evaluate.
        X_val (list): List of input tensors.
        Y_val (list): List of true scores.
        
    Returns:
        float: The computed MAE score.
    """
    model.eval()
    criterion = nn.L1Loss()
    total_loss = 0.0
    
    with torch.no_grad():
        for x_i, y_i in zip(X_val, Y_val):
            # x_i expected to be reshaped for model input (seq_len, batch, embed_dim)
            out = model(x_i.unsqueeze(1))
            loss = criterion(out.squeeze(), torch.tensor(y_i, dtype=torch.float))
            total_loss += loss.item()
            
    return total_loss / max(len(X_val), 1)

if __name__ == "__main__":
    pass
