# WhatsApp Bot with Admin Panel

A WhatsApp bot that helps users find travel tours and answers travel-related questions, with an admin panel for configuration.

## Features

- WhatsApp Web integration using whatsapp-web.js
- Tour search functionality via Tourvisor API
- ChatGPT integration for answering travel-related questions
- Admin panel for managing bot settings
- Real-time QR code scanning for authentication
- Settings management (API keys, system prompt)

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Access the admin panel at `http://localhost:3000`

## Admin Panel

The admin panel allows you to:

1. **Connect to WhatsApp**: Scan the QR code to connect the bot to WhatsApp.
2. **Monitor Status**: View the bot's connection status.
3. **Configure Settings**: Update API keys, login credentials, and system prompt.

### Login Credentials

- **Username**: admin
- **Password**: admin

## Bot Commands

- `тур` - Start the tour search process
- Any other message - Get a response from ChatGPT about travel-related questions

## Settings Configuration

In the admin panel, you can configure:

1. **OpenAI API Key**: For ChatGPT integration
2. **Tourvisor Login & Password**: For accessing the tour search API
3. **System Prompt**: Define the bot's personality and behavior

## License

This project is licensed under the MIT License.

## Support

For any issues or questions, please open an issue in the repository. 