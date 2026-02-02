# Frontend Documentation (`src/`)

The `src/` directory contains the source code for the frontend application, built with **React**, **Vite**, and **Tailwind CSS**. It interacts with the backend API hosted on Cloudflare Workers.

## Directory Structure

### Root Files
- **`App.tsx`**: The main application component. It handles client-side routing using `react-router-dom`, manages global state (like authentication and user sessions), and defines the layout structure.
- **`main.tsx`**: The entry point of the React application. It mounts the `App` component to the DOM.
- **`index.css`**: Global CSS styles, including Tailwind CSS directives and custom utility classes.
- **`types.ts`**: Shared TypeScript definitions used across the frontend application.
- **`theme.ts`**: Theme configuration and constants.
- **`vite-env.d.ts`**: Vite environment type definitions.

### Subdirectories

#### `components/`
Contains reusable UI components.
- **`Layout.tsx`**: The main layout wrapper for authenticated pages.
- **`DepthUI/`**: Custom UI components following the "Depth" design system (cards, buttons, etc.).
- **`SignupForm.tsx`**: Registration form component.
- **`LogoStack.tsx`**: Branding component.
- **`DateField.tsx`**: Custom date input component.
- **`ImageKitUpload.tsx`**: Component for handling image uploads via ImageKit.

#### `pages/`
Contains top-level page components corresponding to routes.
- **`DashboardPage.tsx`**: The main dashboard view showing statistics and AC unit status.
- **`MaintenancePage.tsx`**: Detailed view for AC maintenance records, including the drawing canvas for technical notes.
- **`MaintenanceSearchPage.tsx`**: Search interface for finding AC units.
- **`AdminUsersPage.tsx`**: Admin interface for managing users and site assignments.
- **`AdminSitesPage.tsx`**: Admin interface for managing sites.
- **`CompleteProfilePage.tsx`**: Page for completing user profile information after social login.

#### `hooks/`
Custom React hooks for encapsulating logic and data fetching.
- **`useAuthForms.ts`**: Manages state for login and signup forms.
- **`useAcRecords.ts`**: Fetches and manages AC unit records.
- **`useAdminUsers.ts`**: Fetches and manages user data for admins.
- **`useSites.ts`**: Fetches and manages site data.
- **`useAllowlist.ts`**: Manages the email allowlist for site registration.

#### `lib/`
Utility libraries and configuration.
- **`auth-client.ts`**: Configuration for the Better Auth client.

## Key Features
- **Authentication**: Handled via `better-auth` client, supporting username/password and Google OAuth.
- **Routing**: Client-side routing with `react-router-dom`.
- **State Management**: Uses React Context and custom hooks for managing application state.
- **Styling**: Utility-first styling with Tailwind CSS.
