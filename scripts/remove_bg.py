
import sys
import os

def remove_black_background(input_path, output_path, threshold=50):
    """
    Simple background removal for black/dark backgrounds.
    Reads an image (assumes PNG/JPG), scans for dark pixels, and sets alpha to 0.
    Since we don't have PIL, we might need to rely on a different approach or assume PIL is installed.
    Let's check for PIL first.
    """
    try:
        from PIL import Image
    except ImportError:
        print("PIL/Pillow not installed. Installing...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
        from PIL import Image

    print(f"Processing {input_path}...")
    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        newData = []
        for item in datas:
            # Check for black/dark pixels
            # R, G, B, A
            if item[0] < threshold and item[1] < threshold and item[2] < threshold:
                newData.append((0, 0, 0, 0)) # Transparent
            else:
                newData.append(item)

        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Saved to {output_path}")
    except Exception as e:
        print(f"Failed to process {input_path}: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python remove_bg.py <file1> <file2> ...")
        sys.exit(1)
    
    for file_path in sys.argv[1:]:
        if os.path.exists(file_path):
            remove_black_background(file_path, file_path) # Overwrite
        else:
            print(f"File not found: {file_path}")
