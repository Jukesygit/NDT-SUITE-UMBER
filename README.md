# NDT Tool Suite

A modular Non-Destructive Testing (NDT) tool suite for managing inspection data, generating reports, and visualizing scan results.

## Features

- **Data Hub**: Organize and manage inspection scans by asset and vessel
- **TOFD Calculator**: Calculate coverage and dead zones for Time-of-Flight Diffraction inspections
- **C-Scan Visualizer**: Visualize and analyze ultrasonic C-scan data
- **PEC Visualizer**: Visualize Pulsed Eddy Current inspection results
- **3D Viewer**: Interactive 3D visualization of inspection assets
- **NII Coverage Calculator**: Calculate NII (Normally Incident Inspection) coverage
- **Report Generator**: Generate professional inspection reports
- **Cloud Sync**: Synchronize data with Supabase backend
- **User Management**: Role-based access control and organization management

## Project Structure

```
NDT SUITE UMBER/
├── src/                    # Source code
│   ├── components/         # Reusable UI components
│   ├── styles/            # CSS stylesheets
│   ├── tools/             # Individual tool modules
│   ├── main.js            # Application entry point
│   ├── auth-manager.js    # Authentication management
│   ├── data-manager.js    # Local data management
│   ├── sync-service.js    # Cloud synchronization
│   └── ...
├── docs/                   # Documentation
├── database/              # SQL schema files
├── public/                # Static assets
├── dist/                  # Production build output
└── package.json           # Project dependencies
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure your environment variables:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Documentation

- [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) - Production deployment guide
- [Supabase Setup](docs/SUPABASE_SETUP.md) - Database configuration
- [Quick Start Sync](docs/QUICK_START_SYNC.md) - Quick sync setup guide
- [Glassmorphic Theme Guide](docs/GLASSMORPHIC_THEME_GUIDE.md) - UI theming guide

## Database Setup

All database schema files are located in the `database/` directory. See [Supabase Setup](docs/SUPABASE_SETUP.md) for detailed instructions.

## License

Copyright © 2024. All rights reserved.
