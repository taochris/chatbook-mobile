# 🚀 Guide de configuration - Chatbook Export Mobile

## 📋 Prérequis

### Pour Android :
- ✅ Node.js 18+ installé
- ✅ Android Studio installé
- ✅ SDK Android 33+ configuré
- ✅ Variable d'environnement ANDROID_HOME configurée
- ✅ Java JDK 11+ installé

### Pour iOS (Mac uniquement) :
- ✅ Xcode 14+ installé
- ✅ CocoaPods installé (`sudo gem install cocoapods`)
- ✅ Command Line Tools installés

---

## 🔧 Étapes de configuration

### 1. Créer les dossiers natifs

Les dossiers `android/` et `ios/` doivent être créés avec React Native CLI :

```bash
# Option A : Créer un nouveau projet et copier les dossiers
npx react-native init TempProject
# Puis copier android/ et ios/ dans chatbook-mobile/

# Option B : Utiliser le template (recommandé)
cd chatbook-mobile
npx react-native init ChatbookExport --directory . --skip-install
```

### 2. Configurer Firebase

#### Android :
1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionner le projet Chatbook
3. Ajouter une app Android
4. Package name : `com.chatbookexport`
5. Télécharger `google-services.json`
6. Placer dans `android/app/google-services.json`

#### iOS :
1. Dans Firebase Console, ajouter une app iOS
2. Bundle ID : `com.chatbookexport`
3. Télécharger `GoogleService-Info.plist`
4. Placer dans `ios/ChatbookExport/GoogleService-Info.plist`

### 3. Installer les dépendances Firebase

```bash
npm install @react-native-firebase/app @react-native-firebase/database @react-native-firebase/storage
```

### 4. Configurer les permissions Android

Éditer `android/app/src/main/AndroidManifest.xml` :

```xml
<manifest>
  <uses-permission android:name="android.permission.READ_SMS" />
  <uses-permission android:name="android.permission.READ_CONTACTS" />
  <uses-permission android:name="android.permission.INTERNET" />
  
  <application>
    <!-- ... -->
  </application>
</manifest>
```

### 5. Installer react-native-get-sms-android

```bash
npm install react-native-get-sms-android
```

### 6. Lancer l'application

#### Android :
```bash
# Démarrer Metro
npm start

# Dans un autre terminal, lancer sur Android
npm run android
```

#### iOS :
```bash
# Installer les pods
cd ios && pod install && cd ..

# Lancer sur iOS
npm run ios
```

---

## 🧪 Tests

### Test avec émulateur Android :
1. Ouvrir Android Studio
2. Lancer un émulateur (API 33+)
3. Exécuter `npm run android`

### Test avec appareil réel :
1. Activer le mode développeur sur l'appareil
2. Activer le débogage USB
3. Connecter l'appareil
4. Exécuter `npm run android`

---

## 🔗 Intégration avec l'app Web

L'app mobile génère un code à 6 caractères qui permet d'importer les messages sur l'app web.

### Flux complet :
1. **Mobile** : L'utilisateur exporte ses messages → Code généré
2. **Web** : L'utilisateur entre le code → Messages importés
3. **Web** : Création du livre avec MessageEditor

### Configuration Firebase partagée :
- Même projet Firebase
- Même structure de données (`mobile-imports/`)
- Même logique d'expiration (24h)

---

## 📱 Structure de l'app

```
src/
├── screens/
│   ├── ConversationListScreen.js  # Liste des conversations SMS
│   └── ExportScreen.js            # Export et affichage du code
├── services/
│   ├── smsService.js              # Lecture des SMS Android
│   └── firebaseService.js         # Upload vers Firebase
└── utils/
    └── helpers.js                 # Fonctions utilitaires
```

---

## 🐛 Dépannage

### Erreur : "SDK location not found"
```bash
# Créer local.properties dans android/
echo "sdk.dir=C:\\Users\\VOTRE_NOM\\AppData\\Local\\Android\\Sdk" > android/local.properties
```

### Erreur : "Unable to load script"
```bash
# Nettoyer le cache
npm start -- --reset-cache
```

### Erreur permissions SMS
- Vérifier AndroidManifest.xml
- Demander les permissions au runtime (déjà implémenté)
- Tester sur Android 6.0+ (permissions runtime)

---

## 📚 Ressources

- [React Native Docs](https://reactnative.dev/)
- [Firebase React Native](https://rnfirebase.io/)
- [Android SMS Permissions](https://developer.android.com/reference/android/Manifest.permission#READ_SMS)

---

## ✅ Checklist avant déploiement

- [ ] Firebase configuré (google-services.json)
- [ ] Permissions Android configurées
- [ ] Tests sur émulateur réussis
- [ ] Tests sur appareil réel réussis
- [ ] Code de l'app web mis à jour avec la même logique Firebase
- [ ] Documentation utilisateur créée
- [ ] Icône de l'app personnalisée
- [ ] Splash screen configuré
- [ ] Version signée pour le Play Store

---

**Prochaine étape** : Copier les dossiers `android/` et `ios/` depuis un projet React Native template.
