import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useTheme } from './theme';

// Only one row stays open at a time across every list.
let closePrevRow: (() => void) | null = null;

interface Props {
  /** swipe right (reveals the green side) — e.g. mark done */
  onSwipeRight?: () => void;
  /** swipe left (reveals the red side) — e.g. delete */
  onSwipeLeft?: () => void;
  rightIcon?: string;
  leftIcon?: string;
  /** corner radius of the row card — the action layer is clipped to it */
  radius?: number;
  children: React.ReactNode;
}

/**
 * Fixed width on purpose (UI-01): the action layer used to be `flex: 1`,
 * so the revealed color spanned the ENTIRE row width behind the card —
 * an oversized red/green bar bleeding past the card's rounded corners
 * and into the spacing below it. A bounded tile + a clipped container
 * keeps the color exactly behind the revealed strip of the card.
 */
const ACTION_WIDTH = 84;

function SideAction({
  icon,
  bg,
  onTap,
  label,
}: {
  icon: string;
  bg: string;
  onTap: () => void;
  /** Accessible name; defaults to the icon itself (screen readers
   *  voice emoji names) when a caller does not supply one. */
  label?: string;
}) {
  return (
    <View style={[styles.action, { backgroundColor: bg }]}>
      <Pressable onPress={onTap} hitSlop={10} accessibilityRole="button" accessibilityLabel={label ?? icon}>
        <Text style={styles.icon}>{icon}</Text>
      </Pressable>
    </View>
  );
}

/**
 * ONE swipeable row wrapper for every tab list.
 * Right swipe → green action, left swipe → red action.
 * Fires the action and snaps closed (remount via key); opening one row
 * closes whatever row was open before it.
 */
export function SwipeRow({
  onSwipeRight,
  onSwipeLeft,
  rightIcon = '✅',
  leftIcon = '🗑️',
  radius = 12,
  children,
}: Props) {
  const { palette: P } = useTheme();
  // bump the key to remount the Swipeable closed after an action fires
  const [nonce, setNonce] = useState(0);
  const closeSelf = () => setNonce((n) => n + 1);

  const fire = (dir: 'left' | 'right') => {
    if (closePrevRow) {
      const c = closePrevRow;
      closePrevRow = null;
      c();
    }
    closeSelf();
    (dir === 'left' ? onSwipeRight : onSwipeLeft)?.();
  };

  return (
    <Swipeable
      key={nonce}
      onSwipeableWillOpen={() => {
        // a new swipe starts: close whatever row was open, then register this one
        if (closePrevRow) {
          const c = closePrevRow;
          closePrevRow = null;
          c();
        }
        closePrevRow = closeSelf;
      }}
      onSwipeableOpen={fire}
      renderLeftActions={
        onSwipeRight
          ? () => (
              <SideAction
                icon={rightIcon}
                bg={P.success}
                onTap={() => fire('left')}
              />
            )
          : undefined
      }
      renderRightActions={
        onSwipeLeft
          ? () => (
              <SideAction icon={leftIcon} bg={P.danger} onTap={() => fire('right')} />
            )
          : undefined
      }
      overshootLeft={false}
      overshootRight={false}
      containerStyle={{ borderRadius: radius, overflow: 'hidden' }}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 24,
    color: '#fff',
  },
});
