# 📱 Chatbook Export - Application Mobile

Application React Native pour exporter vos messages iPhone (iMessage/SMS) et Android (SMS) vers Chatbook.

## 🎯 Fonctionnalités

- ✅ Lecture des messages SMS/iMessage
- ✅ Sélection de conversation
- ✅ Export vers Firebase avec code à 6 caractères
- ✅ Ouverture automatique dans le navigateur
- ✅ Support iOS et Android

## 🚀 Installation

```bash
# Installer les dépendances
npm install

# Lancer sur Android
npm run android

# Lancer sur iOS (Mac uniquement)
npm run ios
```

## 📋 Prérequis

### Android
- Android Studio installé
- SDK Android 33+
- Un appareil Android ou émulateur

### iOS (Mac uniquement)
- Xcode 14+
- CocoaPods installé
- Un iPhone ou simulateur iOS

## 🔧 Configuration Firebase

1. Télécharger `google-services.json` depuis Firebase Console
2. Placer dans `android/app/`
3. Pour iOS : télécharger `GoogleService-Info.plist` et placer dans `ios/`

## 📱 Permissions requises

### Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.READ_CONTACTS" />
<uses-permission android:name="android.permission.INTERNET" />
```

### iOS (Info.plist)
```xml
<key>NSContactsUsageDescription</key>
<string>Pour afficher les noms des contacts dans vos conversations</string>
```

## 📂 Structure

```
src/
├── screens/
│   ├── HomeScreen.js          # Écran d'accueil
│   ├── ConversationList.js    # Liste des conversations
│   └── ExportScreen.js        # Écran d'export avec code
├── components/
│   ├── ConversationItem.js    # Item de conversation
│   └── CodeDisplay.js         # Affichage du code
├── services/
│   ├── smsService.js          # Lecture des SMS
│   └── firebaseService.js     # Upload vers Firebase
└── utils/
    └── helpers.js             # Fonctions utilitaires
```

## 🔗 Lien avec l'app Web

L'app mobile génère un code à 6 caractères qui permet d'importer les messages sur https://chatbook.app

## 📄 Licence

Propriétaire - Chatbook © 2025
