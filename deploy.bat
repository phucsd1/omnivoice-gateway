@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo   OmniVoice Gateway Auto-Deployment Tool (Windows)
echo =======================================================
echo.

:: Check if git remote 'hf' is configured
git remote get-url hf >nul 2>&1
if errorlevel 1 (
    echo [INFO] Hugging Face remote 'hf' chua duoc cau hinh.
    echo Vui long cung cap thong tin de tu dong hoa luu credentials.
    echo.
    set /p hf_user="1. Username Hugging Face: "
    set /p hf_space="2. Ten Space - vi du: omnivoice-backend: "
    echo 3. Nhap Hugging Face Access Token quyen WRITE:
    echo    Lay tai dia chi: https://huggingface.co/settings/tokens
    set /p hf_token="Token: "
    
    echo.
    echo [INFO] Dang thiet lap remote 'hf' voi credentials bao mat...
    git remote add hf https://!hf_user!:!hf_token!@huggingface.co/spaces/!hf_user!/!hf_space!
    echo [SUCCESS] Da thiet lap remote hf thanh cong!
    echo.
)

:: Check for local uncommitted changes
git status --porcelain | findstr /R "^" >nul
if "%errorlevel%"=="0" (
    echo [INFO] Phat hien thay doi chua commit trong thu muc code.
    set /p commit_msg="Nhap noi dung commit - hoac nhan Enter de dung auto deploy: "
    if "!commit_msg!"=="" set commit_msg=auto deploy: %date% %time%
    
    echo.
    echo [INFO] Dang commit cac thay doi...
    git add .
    git commit -m "!commit_msg!"
) else (
    echo [INFO] Khong co thay doi moi chua commit.
)

echo.
echo [1/2] Dang dong bo len GitHub (origin main)...
git pull origin main
git push origin main

echo.
echo [2/2] Dang dong bo len Hugging Face Space (hf main)...
git push hf main --force

echo.
echo =======================================================
echo   [SUCCESS] Hoan thanh day code len ca GitHub va HF!
echo =======================================================
echo.
pause
