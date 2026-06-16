import torch
import torch.nn as nn
import torch.optim as optim

def train_model(model: nn.Module, X_train: list, Y_train: list, epochs: int = 1, lr: float = 0.001) -> nn.Module:
    """
    Trains the provided PyTorch model on the dataset.
    
    Args:
        model (nn.Module): The model to train.
        X_train (list): List of input tensors.
        Y_train (list): List of target scores.
        epochs (int): Number of epochs to train.
        lr (float): Learning rate.
        
    Returns:
        nn.Module: The trained model.
    """
    model.train()
    criterion = nn.L1Loss()
    optimizer = optim.Adam(model.parameters(), lr=lr)
    
    for epoch in range(epochs):
        for x_i, y_i in zip(X_train, Y_train):
            optimizer.zero_grad()
            out = model(x_i.unsqueeze(1))
            loss = criterion(out.squeeze(), torch.tensor(y_i, dtype=torch.float))
            loss.backward()
            optimizer.step()
            
    return model

if __name__ == "__main__":
    pass
