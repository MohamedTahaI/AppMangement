// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: [
      'src/components/ui/AnimatedListItem.tsx',
      'src/components/ui/EmptyState.tsx',
      'src/components/ui/FormField.tsx',
      'src/components/ui/PressableCard.tsx',
      'src/components/ui/SegmentedControl.tsx',
      'src/components/ui/Skeleton.tsx',
      'src/components/ui/StatusChip.tsx',
      'src/components/ui/Toast.tsx',
    ],
    rules: {
      // Reanimated SharedValues are intentionally mutated through their documented .value API.
      'react-hooks/immutability': 'off',
    },
  },
]);
