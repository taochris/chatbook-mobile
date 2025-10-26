import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Animated,
  ImageBackground,
} from 'react-native';

export default function HomeScreen({ navigation }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../assets/bg-illustration.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
          <StatusBar barStyle="dark-content" backgroundColor="#e5e7eb" />
      
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.logo}>📖</Text>
        <Text style={styles.title}>Chatbook Export</Text>
        <Text style={styles.subtitle}>
          Transformez vos conversations en souvenirs
        </Text>
      </View>

      {/* Fonctionnalités */}
      <View style={styles.featuresContainer}>
        <View style={styles.featureCard}>
          <Text style={styles.featureTitle}>Rapide</Text>
          <Text style={styles.featureText}>
            Export en quelques secondes
          </Text>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureTitle}>Créatif</Text>
          <Text style={styles.featureText}>
            Personnalisez votre livre
          </Text>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureTitle}>Sécurisé</Text>
          <Text style={styles.featureText}>
            Données chiffrées, expirées après 24h
          </Text>
        </View>
      </View>

      {/* Bouton principal en bas */}
      <TouchableOpacity 
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => navigation.navigate('Export')}
      >
        <Animated.View style={[styles.primaryButton, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.primaryButtonText}>Commencer l'export</Text>
          <Text style={styles.primaryButtonIcon}>→</Text>
        </Animated.View>
      </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: 'rgba(229, 231, 235, 0.7)',
  },
  header: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 28,
  },
  logo: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#065f46',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: '#6ee7b7',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    borderWidth: 2,
    borderColor: '#34d399',
    marginHorizontal: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#065f46',
    fontSize: 17,
    fontWeight: '700',
    marginRight: 8,
  },
  primaryButtonIcon: {
    color: '#065f46',
    fontSize: 18,
    fontWeight: 'bold',
  },
  featuresContainer: {
    marginBottom: 40,
    marginHorizontal: 16,
  },
  featureCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#34d399',
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#34d399',
    marginBottom: 6,
    textAlign: 'center',
  },
  featureText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    textAlign: 'center',
  },
});
