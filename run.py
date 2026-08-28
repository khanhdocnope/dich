import sys
import os

# Fix: PyInstaller windowed mode sets stdout/stderr to None
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ballontranslator.launch import main

if __name__ == '__main__':
    main()
