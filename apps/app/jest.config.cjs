module.exports = {
  preset: 'react-native',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^react-test-renderer/package\\.json$': '<rootDir>/../../node_modules/react/package.json',
    '^expo-sqlite$': '<rootDir>/test-mocks/expo-sqlite.ts',
    '^expo-router$': '<rootDir>/test-mocks/expo-router.ts',
    '^expo-notifications$': '<rootDir>/test-mocks/expo-notifications.ts',
    '^react-native-chart-kit/v2$': '<rootDir>/test-mocks/react-native-chart-kit.tsx',
    '^react-native-spotlight-tour$': '<rootDir>/test-mocks/react-native-spotlight-tour.tsx',
  },
  resetMocks: false,
};
