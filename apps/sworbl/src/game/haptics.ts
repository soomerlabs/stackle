// The haptic language (owner-designed on the spike): the tick CRESCENDOS as
// the chain grows — soft on the first letters, heavy as a long word lands.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const native = Platform.OS !== 'web';

const RAMP = [
  Haptics.ImpactFeedbackStyle.Soft, // 1
  Haptics.ImpactFeedbackStyle.Soft, // 2
  Haptics.ImpactFeedbackStyle.Light, // 3
  Haptics.ImpactFeedbackStyle.Light, // 4
  Haptics.ImpactFeedbackStyle.Medium, // 5
  Haptics.ImpactFeedbackStyle.Medium, // 6
  Haptics.ImpactFeedbackStyle.Heavy, // 7+
];

export const haptic = {
  tick(chainLen = 1) {
    if (native) Haptics.impactAsync(RAMP[Math.min(chainLen, RAMP.length) - 1]).catch(() => {});
  },
  soft() {
    if (native) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
  },
  good() {
    if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  bad() {
    if (native) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
