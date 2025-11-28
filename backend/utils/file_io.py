"""
Async file I/O operations using aiofiles
"""
import os
import asyncio
import aiofiles
from pathlib import Path
from typing import Optional, List
from utils.custom_exception import FileNotFoundException, FileUploadException


async def ensure_dir_exists(directory: Path) -> None:
    """Ensure directory exists"""
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise FileUploadException(f"Failed to create directory: {str(e)}")


async def save_file(file_path: Path, content: bytes) -> None:
    """Save file asynchronously"""
    try:
        await ensure_dir_exists(file_path.parent)
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)
    except FileUploadException:
        raise
    except Exception as e:
        raise FileUploadException(f"Failed to save file: {str(e)}")


async def load_file(file_path: Path) -> bytes:
    """Load file asynchronously"""
    try:
        if not await check_file_exists(file_path):
            raise FileNotFoundException(f"File not found: {file_path}")
        
        async with aiofiles.open(file_path, "rb") as f:
            content = await f.read()
        return content
    except FileNotFoundException:
        raise
    except Exception as e:
        raise FileUploadException(f"Failed to load file: {str(e)}")


async def remove_file(file_path: Path) -> None:
    """Remove file asynchronously"""
    try:
        if not await check_file_exists(file_path):
            raise FileNotFoundException(f"File not found: {file_path}")
        
        await asyncio.to_thread(os.remove, file_path)
    except FileNotFoundException:
        raise
    except Exception as e:
        raise FileUploadException(f"Failed to remove file: {str(e)}")


async def check_file_exists(file_path: Path) -> bool:
    """Check if file exists"""
    return await asyncio.to_thread(file_path.exists)


async def get_file_info(file_path: Path) -> os.stat_result:
    """Get file stat info"""
    try:
        if not await check_file_exists(file_path):
            raise FileNotFoundException(f"File not found: {file_path}")
        
        return await asyncio.to_thread(file_path.stat)
    except FileNotFoundException:
        raise
    except Exception as e:
        raise FileUploadException(f"Failed to get file info: {str(e)}")


async def get_files_in_dir(
    directory: Path,
    pattern: Optional[str] = None
) -> List[Path]:
    """List files in directory"""
    try:
        if not await check_file_exists(directory):
            return []
        
        def _list_files_sync():
            files = []
            if pattern:
                for file_path in directory.glob(pattern):
                    if file_path.is_file():
                        files.append(file_path)
            else:
                for file_path in directory.iterdir():
                    if file_path.is_file():
                        files.append(file_path)
            return files
        
        return await asyncio.to_thread(_list_files_sync)
    except Exception as e:
        raise FileUploadException(f"Failed to list files: {str(e)}")


async def search_file_by_prefix(
    directory: Path,
    prefix: str
) -> Optional[Path]:
    """Find file by name prefix"""
    try:
        files = await get_files_in_dir(directory)
        for file_path in files:
            if file_path.name.startswith(prefix):
                return file_path
        return None
    except Exception as e:
        raise FileUploadException(f"Failed to search file: {str(e)}")

