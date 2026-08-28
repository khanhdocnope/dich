@echo off
echo ========================================
echo  Building BallonsTranslator EXE
echo ========================================

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Python not found! Please install Python 3.10
    pause
    exit /b 1
)

REM Install dependencies
echo.
echo [1/5] Installing dependencies...
pip install -r requirements.txt
pip install pyinstaller

REM Install PyTorch CPU
echo.
echo [2/5] Installing PyTorch (CPU version)...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

REM Build EXE
echo.
echo [3/5] Building EXE...
pyinstaller ^
    --name "BallonsTranslator" ^
    --onedir ^
    --windowed ^
    --noconfirm ^
    --clean ^
    --add-data "resources;resources" ^
    --add-data "config;config" ^
    --add-data "data;data" ^
    --hidden-import ballontranslator ^
    --hidden-import ballontranslator.modules ^
    --hidden-import ballontranslator.ui ^
    --hidden-import ballontranslator.utils ^
    --collect-submodules ballontranslator ^
    ballontranslator/__main__.py

REM Copy extra files
echo.
echo [4/5] Copying extra files...
xcopy /E /I /Y "fonts" "dist\BallonsTranslator\fonts"
xcopy /E /I /Y "doc" "dist\BallonsTranslator\doc"
copy /Y "launch_win.bat" "dist\BallonsTranslator\"
copy /Y "README.md" "dist\BallonsTranslator\"

REM Create ZIP
echo.
echo [5/5] Creating ZIP archive...
powershell -Command "Compress-Archive -Path 'dist\BallonsTranslator\*' -DestinationPath 'dist\BallonsTranslator_win.zip' -Force"

echo.
echo ========================================
echo  Build complete!
echo  Output: dist\BallonsTranslator_win.zip
echo ========================================
pause
