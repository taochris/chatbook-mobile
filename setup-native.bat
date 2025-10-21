@echo off
echo ========================================
echo Chatbook Export - Setup Native Folders
echo ========================================
echo.

cd ..

echo [1/4] Creating temporary React Native project...
call npx @react-native-community/cli@latest init ChatbookTemp --skip-install

if not exist "ChatbookTemp\android" (
    echo ERROR: Failed to create temporary project
    pause
    exit /b 1
)

echo.
echo [2/4] Copying Android folder...
xcopy /E /I /Y ChatbookTemp\android chatbook-mobile\android

echo.
echo [3/4] Copying iOS folder...
xcopy /E /I /Y ChatbookTemp\ios chatbook-mobile\ios

echo.
echo [4/4] Cleaning up temporary project...
rmdir /S /Q ChatbookTemp

echo.
echo ========================================
echo SUCCESS! Native folders created.
echo ========================================
echo.
echo Next steps:
echo 1. Configure Firebase (see SETUP.md)
echo 2. Add SMS permissions (see GENERATE_NATIVE.md)
echo 3. Run: npm run android
echo.
pause
