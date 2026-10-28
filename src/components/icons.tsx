/**
 * Icônes dessinées avec des vues natives : aucune police d'icônes ni module natif.
 * Toujours décoratives : le sens est porté par le libellé voisin.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Micro : capsule, arceau, pied. `size` = hauteur totale. */
export const MicIcon: React.FC<{ readonly size: number; readonly color: string }> = ({ size, color }) => {
  const capsuleW = size * 0.42;
  const capsuleH = size * 0.6;
  const stroke = Math.max(3, size * 0.075);
  const arcW = size * 0.68;
  const arcH = size * 0.42;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={{ width: capsuleW, height: capsuleH, borderRadius: capsuleW / 2, backgroundColor: color }} />
      <View
        style={{
          position: 'absolute',
          top: capsuleH * 0.55,
          width: arcW,
          height: arcH,
          borderWidth: stroke,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: arcW / 2,
          borderBottomRightRadius: arcW / 2,
        }}
      />
      <View style={{ position: 'absolute', top: capsuleH * 0.55 + arcH - 1, width: stroke, height: size * 0.14, backgroundColor: color }} />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: size * 0.44,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

/** Cadenas : anse et corps. */
export const LockIcon: React.FC<{ readonly size: number; readonly color: string }> = ({ size, color }) => {
  const stroke = Math.max(2, size * 0.12);
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          width: size * 0.56,
          height: size * 0.5,
          borderWidth: stroke,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: size * 0.28,
          borderTopRightRadius: size * 0.28,
        }}
      />
      <View style={[styles.lockBody, { width: size * 0.82, height: size * 0.56, borderRadius: size * 0.12, backgroundColor: color }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  lockBody: { position: 'absolute', bottom: 0 },
});
