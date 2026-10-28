import React from 'react';
import { Text, type TextProps } from 'react-native';

import { MAX_FONT_SCALE } from '../theme/theme';

/** <Text> avec agrandissement système plafonné à 200 % (V3.0 §3.1). */
export const AccessibleText: React.FC<TextProps> = ({
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}) => <Text maxFontSizeMultiplier={maxFontSizeMultiplier} {...rest} />;

export default AccessibleText;
