@echo off
echo ========================================
echo Fix React Native Dependencies
echo ========================================
echo.

echo [1/2] Creating local Maven repository...
mkdir android\local-maven 2>nul

echo.
echo [2/2] Copying React Native AAR files...
xcopy /E /I /Y node_modules\react-native\android android\local-maven\com\facebook\react\react-native\0.73.0\

echo.
echo Done! Now run: npm run android
pause
