# Debug Components

This directory contains components that were created during debugging and development of the authentication system. They are not used in the main application but are preserved for reference and potential future debugging.

## Components

- **DirectLogin.jsx**: A standalone login component that makes direct API calls without using AuthContext. Useful for isolating authentication issues.

- **LoginTest.jsx**: A component designed specifically for testing the login API. It displays detailed information about API responses and cookies.

- **SimplestLoginForm.jsx**: A minimal HTML-only form that submits directly to the backend. Useful for testing backend authentication without any JavaScript interference.

## Usage

To use these components, uncomment their imports and routes in `src/App.jsx`. They are accessible under the `/debug/` routes. 