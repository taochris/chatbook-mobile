import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import HomeScreen from '../screens/HomeScreen';
import ExportSMSScreen from '../screens/ExportSMSScreen';
import GuideScreen from '../screens/GuideScreen';

const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#34d399',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#34d399',
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          color: '#1f2937',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Accueil',
          tabBarIcon: () => <Icon name="home" size={24} color="#34d399" />,
        }}
      />
      <Tab.Screen
        name="Export"
        component={ExportSMSScreen}
        options={{
          tabBarLabel: 'Exporter',
          tabBarIcon: () => <Icon name="cloud-upload" size={24} color="#34d399" />,
        }}
      />
      <Tab.Screen
        name="Guide"
        component={GuideScreen}
        options={{
          tabBarLabel: 'Guide',
          tabBarIcon: () => <Icon name="help-circle" size={24} color="#34d399" />,
        }}
      />
    </Tab.Navigator>
  );
}

