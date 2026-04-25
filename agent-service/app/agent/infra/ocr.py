import logging
from typing import Optional

logger = logging.getLogger(__name__)

_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
        logger.info("✓ RapidOCR 实例已创建")
    return _ocr


def extract_text_from_image(image_path: str) -> Optional[str]:
    ocr = get_ocr()
    result, _ = ocr(image_path)
    if not result:
        return None
    return "\n".join([line[1] for line in result])
