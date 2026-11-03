module.exports = {
  preset: 'react-native',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^react-test-renderer/package\\.json$': '<rootDir>/../../node_modules/react/package.json',
    '^expo-sqlite$': '<rootDir>/test-mocks/expo-sqlite.ts',
    '^react-native-chart-kit/v2$': '<rootDir>/test-mocks/react-native-chart-kit.tsx',
  },
  resetMocks: false,
};
