'use strict';
// Stub for dependencies replaced via `overrides` in the root package.json because
// nothing loads them at runtime (they only bloat the build and trip `npm audit`).
// If you see this error, an upstream package started using the real one: remove its override.
throw new Error('unused-dependency stub was required: a dependency replaced via package.json overrides is now actually used');
