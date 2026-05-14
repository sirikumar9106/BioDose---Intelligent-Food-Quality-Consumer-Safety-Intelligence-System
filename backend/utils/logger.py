from loguru import logger

logger.add(
    "biodose.log",
    rotation="1 MB",
    level="INFO",
)

app_logger = logger