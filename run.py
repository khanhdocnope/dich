import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ballontranslator.launch import main

if __name__ == '__main__':
    main()
