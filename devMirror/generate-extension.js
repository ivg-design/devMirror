const yeoman = require('yeoman-environment');
const env = yeoman.createEnv();

env.register(require.resolve('generator-code'), 'code');

env.run('code', {
  extensionType: 'ts',
  extensionName: 'my-extension',
  extensionDisplayName: 'My Extension',
  extensionDescription: 'A VS Code extension',
  extensionIdentifier: 'publisher.my-extension',
  gitInit: true,
  openWith: 'skip',
  pkgManager: 'npm',
  bundle: false,
  webpack: false
}, (err) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  console.log('Extension generated successfully!');
});