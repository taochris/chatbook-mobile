@echo off
echo ========================================
echo Fix Gradle Java Path
echo ========================================
echo.

echo [1/3] Suppression du cache Gradle...
cd android
call gradlew.bat clean --stop
cd ..

echo.
echo [2/3] Suppression du dossier .gradle...
if exist "android\.gradle" rmdir /S /Q "android\.gradle"
if exist "%USERPROFILE%\.gradle\caches" rmdir /S /Q "%USERPROFILE%\.gradle\caches"

echo.
echo [3/3] Relance du build...
npm run android

pause
