import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS } from '@/config/theme';

// Drop your icon.png into assets/ and this component will use it automatically.
// Until then it falls back to the "GS" text placeholder.
let logoSource: ReturnType<typeof require> | null = null;
try {
  logoSource = require('../../../assets/icon.png');
} catch {
  logoSource = null;
}

interface LogoProps {
  size?: number;
}

export function Logo({ size = 64 }: LogoProps) {
  const radius = size * 0.25;

  if (logoSource) {
    return (
      <Image
        source={logoSource}
        style={[styles.image, { width: size, height: size, borderRadius: radius }]}
        resizeMode="contain"
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text style={[styles.placeholderText, { fontSize: size * 0.4 }]}>GS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: COLORS.accent,
  },
  placeholder: {
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.white,
    fontWeight: '700',
  },
});
