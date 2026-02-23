# Frontend Documentation for High-Frequency Trading Platform

## Overview

This frontend is built using Next.js, Tailwind CSS, and shadcn/ui. It serves as the user interface for the high-frequency trading, causal inference, and multi-agent platform.

## Setup

To get started with the frontend, follow these steps:

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd high-frequency-trading-platform/frontend
   ```

2. **Install Dependencies**
   Make sure you have Node.js installed. Then run:
   ```bash
   npm install
   ```

3. **Run the Development Server**
   Start the Next.js development server:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

## Directory Structure

- `public/`: Contains static assets such as images and fonts.
- `src/components/`: Reusable React components.
- `src/pages/`: Next.js pages for routing.
- `src/styles/`: Global styles and Tailwind CSS configurations.
- `src/utils/`: Utility functions and helpers.

## Tailwind CSS Configuration

The `tailwind.config.js` file is configured to include paths to all template files. Customize the theme as needed.

## Next.js Configuration

The `next.config.js` file contains settings for the Next.js application, including any necessary plugins.

## Deployment

For deployment, you can use Vercel or any other hosting service that supports Next.js applications. Ensure to follow the specific deployment instructions provided by the service.

## Integration with AG-UI Protocol

This frontend is designed to integrate seamlessly with the AG-UI protocol, enabling efficient communication with the backend services.

## Contributing

If you would like to contribute to this project, please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.