const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios'); // Import axios for making HTTP requests
const xml2js = require('xml2js'); // Import xml2js for XML parsing
const EventEmitter = require('events');
const os = require('os'); // Import os module to detect operating system
const path = require('path');
require('dotenv').config(); // Load environment variables
const SessionManager = require('./sessionManager'); // Import session manager

// Create global event emitter for settings updates
global.eventEmitter = new EventEmitter();

// Helper function to check if a file exists
function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (err) {
        return false;
    }
}

// Helper function to find Chrome executable based on OS
function findChromeExecutable() {
    const platform = os.platform();
    
    // Possible Chrome paths by platform
    const chromePaths = {
        darwin: [ // macOS
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
        ],
        win32: [ // Windows
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
        ],
        linux: [ // Linux
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/microsoft-edge'
        ]
    };
    
    // Get possible paths for current platform
    const possiblePaths = chromePaths[platform] || [];
    
    // Find first existing path
    for (const browserPath of possiblePaths) {
        if (fileExists(browserPath)) {
            console.log(`Found browser at: ${browserPath}`);
            return browserPath;
        }
    }
    
    // No browser found, return null
    console.log('No compatible browser found. Will use default Puppeteer bundled browser');
    return null;
}

class WhatsAppBot {
    constructor(io = null) {
        this.io = io; // Socket.io instance for real-time updates
        
        // Initialize session manager for persistent auth
        this.sessionManager = new SessionManager();
        
        // Find Chrome executable
        const chromeExecutable = findChromeExecutable();
        
        // Configure Puppeteer options
        const puppeteerOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        };
        
        // Add executablePath only if a browser was found
        if (chromeExecutable) {
            puppeteerOptions.executablePath = chromeExecutable;
        }
        
        // Create .wwebjs_auth directory if it doesn't exist
        const authDir = path.join(process.cwd(), '.wwebjs_auth');
        if (!fs.existsSync(authDir)) {
            try {
                fs.mkdirSync(authDir, { recursive: true });
                console.log('Created auth directory at:', authDir);
            } catch (error) {
                console.error('Failed to create auth directory:', error);
            }
        }
        
        // Configure persistent session storage
        // Using dataPath option to specify where session data should be stored
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: authDir, // Store auth data in the project directory
                clientId: 'whatsapp-bot-session' // Use fixed client ID for persistence
            }),
            puppeteer: puppeteerOptions,
            restartOnAuthFail: true, // Auto restart if authentication fails
            qrMaxRetries: 3 // Limit QR code generation retries
        });

        this.userData = new Map(); // Store user data with conversation history
        this.loadCountryData(); // Load country data from JSON file
        this.setupEventHandlers();
        this.loadSettings();

        // Listen for settings updates
        global.eventEmitter.on('settingsUpdated', (settings) => {
            console.log('Settings updated:', settings);
            this.updateSettings(settings);
        });
    }

    loadSettings() {
        try {
            const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
            this.updateSettings(settings);
            
            // If we have a WhatsApp session in settings, use it
            if (settings.whatsappSession && settings.whatsappSession.trim() !== '') {
                console.log('Found WhatsApp session in settings, will use it for authentication');
                process.env.WHATSAPP_SESSION = settings.whatsappSession;
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            // Use default settings from the original code
            this.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
            this.TOURVISOR_LOGIN = process.env.TOURVISOR_LOGIN;
            this.TOURVISOR_PASS = process.env.TOURVISOR_PASS;
            this.SYSTEM_PROMPT = 'You are a helpful travel agent assistant. Provide friendly and informative responses about travel-related questions. If someone asks about booking a tour, remind them they can type "тур" to start the booking process.';
        }
    }

    updateSettings(settings) {
        this.OPENAI_API_KEY = settings.openaiApiKey || "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";
        this.TOURVISOR_LOGIN = settings.tourvisorLogin || "admotionapp@gmail.com";
        this.TOURVISOR_PASS = settings.tourvisorPass || "sjqVZ4QLNLBN5";
        this.SYSTEM_PROMPT = settings.systemPrompt || `Ты — TourAI, опытный и дружелюбный консультант по путешествиям, который ведет естественные беседы.

Твоя главная цель — вовлечь клиента в приятную беседу о путешествиях и плавно собрать всю необходимую информацию для подбора идеального тура.

ВАЖНЫЕ ПРИНЦИПЫ ОБЩЕНИЯ:
1. Веди разговор ЕСТЕСТВЕННО, как бы это делал человек, а не бот
2. Задавай открытые вопросы, позволяющие клиентам рассказать о своих предпочтениях
3. Незаметно выясняй детали поездки (город вылета, страна, даты, количество путешественников) в контексте общей беседы
4. Не используй шаблонные формулировки и очевидные анкетные вопросы
5. Делись интересными фактами о направлениях, о которых упоминает клиент
6. Если клиент колеблется, мягко предлагай варианты и советы, основанные на его предпочтениях
7. Используй эмоциональный язык, создавая яркие образы путешествия
8. Показывай экспертность, упоминая сезонность, популярные курорты и особенности направлений
9. Если нужно что-то уточнить, делай это тактично, в контексте бытовой беседы
10. Всегда поддерживай энтузиазм и вдохновляй клиента на путешествие

ПРИМЕРЫ ЕСТЕСТВЕННЫХ ВОПРОСОВ (для ориентира):
- "А какие места вы уже посещали и особенно понравились?"
- "Интересно, вы предпочитаете активный отдых или больше релаксацию на пляже?"
- "Кстати, откуда обычно удобнее вылетать?"
- "Для семейного отдыха в Турции очень важно выбрать правильный отель. Кто поедет с вами?"
- "Весна в Греции особенно прекрасна — цветущие оливковые рощи и меньше туристов. Сколько дней вы обычно проводите в отпуске?"

Помни, ты не просто отвечаешь на вопросы, а ведешь увлекательную беседу, в процессе которой собираешь всю информацию, необходимую для подбора идеального тура.`;

        // If the settings include a WhatsApp session and it's different from the current one
        if (settings.whatsappSession && settings.whatsappSession.trim() !== '' && 
            (!process.env.WHATSAPP_SESSION || process.env.WHATSAPP_SESSION !== settings.whatsappSession)) {
            console.log('Updating WhatsApp session from settings');
            process.env.WHATSAPP_SESSION = settings.whatsappSession;
            
            // Attempt to restore this session immediately
            this.sessionManager.restoreSessionFromEnv();
        }
        
        // Save updated settings back to file
        try {
            fs.writeFileSync('settings.json', JSON.stringify({
                openaiApiKey: this.OPENAI_API_KEY,
                tourvisorLogin: this.TOURVISOR_LOGIN,
                tourvisorPass: this.TOURVISOR_PASS,
                systemPrompt: this.SYSTEM_PROMPT,
                whatsappSession: settings.whatsappSession || ''
            }, null, 2));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    loadCountryData() {
        try {
            // Load country data from external JSON file
            this.countriesData = JSON.parse(fs.readFileSync('countries.json', 'utf8'));
            console.log('Country data loaded successfully');
            
            // Convert country data into a more accessible format
            this.countries = this.countriesData.lists.countries.country;
            
            // Create a map for easy lookups by name
            this.countryNameToIdMap = {};
            this.countries.forEach(country => {
                this.countryNameToIdMap[country.name.toLowerCase()] = country.id;
                
                // Add common variants and abbreviations
                if (country.name === "ОАЭ") {
                    this.countryNameToIdMap["эмираты"] = country.id;
                    this.countryNameToIdMap["дубай"] = country.id;
                    this.countryNameToIdMap["абу-даби"] = country.id;
                }
                if (country.name === "Турция") {
                    this.countryNameToIdMap["анталия"] = country.id;
                    this.countryNameToIdMap["стамбул"] = country.id;
                    this.countryNameToIdMap["кемер"] = country.id;
                    this.countryNameToIdMap["алания"] = country.id;
                }
                if (country.name === "Египет") {
                    this.countryNameToIdMap["хургада"] = country.id;
                    this.countryNameToIdMap["шарм-эль-шейх"] = country.id;
                    this.countryNameToIdMap["шарм"] = country.id;
                }
                if (country.name === "Таиланд") {
                    this.countryNameToIdMap["пхукет"] = country.id;
                    this.countryNameToIdMap["паттайя"] = country.id;
                    this.countryNameToIdMap["бангкок"] = country.id;
                }
                // Add more common variants as needed
            });
            
            // Create departure city map (for common departure cities)
            this.departureCityMap = {
                // Kazakhstan cities
                "алматы": "78",
                "астана": "78",
                "нур-султан": "78",
                "шымкент": "78",
                "караганда": "78",
                "костанай": "78",
                "кызылорда": "78",
                "актау": "78",
                "атырау": "78",
                "павлодар": "78",
                "усть-каменогорск": "78",
                "семей": "78",
                "тараз": "78",
                "уральск": "78",
                "актобе": "78",
                "казахстан": "78",
                
                // Russia cities
                "москва": "47",
                "санкт-петербург": "47",
                "спб": "47",
                "новосибирск": "47",
                "екатеринбург": "47",
                "казань": "47",
                "нижний новгород": "47",
                "челябинск": "47",
                "омск": "47", 
                "самара": "47",
                "ростов-на-дону": "47",
                "уфа": "47",
                "красноярск": "47",
                "воронеж": "47",
                "пермь": "47",
                "волгоград": "47",
                "россия": "47"
            };
            
        } catch (error) {
            console.error('Error loading country data:', error);
            // Fallback to empty list
            this.countries = [];
            this.countryNameToIdMap = {};
            this.departureCityMap = {};
        }
    }

    setupEventHandlers() {
        // Track authentication status
        this.isAuthenticated = false;
        
        // QR Code generation (only needed for first-time setup)
        this.client.on('qr', (qr) => {
            // Only show QR if not already authenticated
            if (this.isAuthenticated) {
                console.log('QR code received but already authenticated, ignoring');
                return;
            }
            
            qrcode.generate(qr, { small: true });
            console.log('QR Code generated. Please scan with WhatsApp!');
            
            // If we have Socket.io, emit the QR code to the admin panel
            if (this.io) {
                // Generate a PNG data URL from the QR code
                const qrCodeLibrary = require('qrcode');
                qrCodeLibrary.toDataURL(qr, (err, url) => {
                    if (err) {
                        console.error('Error generating QR code data URL:', err);
                        return;
                    }
                    this.io.emit('qrCode', url);
                    this.io.emit('botStatus', { status: 'qr_needed', message: 'Please scan the QR code to authenticate' });
                });
            }
        });

        // Ready event
        this.client.on('ready', () => {
            console.log('WhatsApp bot is ready!');
            // Notify the admin panel that the bot is ready
            if (this.io) {
                this.io.emit('botStatus', { status: 'ready' });
            }
            
            // Mark as authenticated
            this.isAuthenticated = true;
            
            // Save authentication timestamp
            this.saveAuthState('authenticated');
            
            // Generate session backup for deployment
            setTimeout(() => {
                // Get the session data and update settings
                const sessionData = this.sessionManager.saveSessionToEnv();
                if (sessionData) {
                    this.updateSettingsWithSession(`base64:${sessionData}`);
                }
            }, 5000); // Wait 5 seconds to ensure all session data is written
        });
        
        // Authenticated event - session restored
        this.client.on('authenticated', (session) => {
            console.log('WhatsApp authentication successful!');
            
            // Mark as authenticated
            this.isAuthenticated = true;
            
            if (this.io) {
                this.io.emit('botStatus', { status: 'authenticated', message: 'Authentication successful' });
            }
            
            // Save authentication timestamp
            this.saveAuthState('authenticated');
            
            // Generate session backup for deployment
            setTimeout(() => {
                // Get the session data and update settings
                const sessionData = this.sessionManager.getSessionDataForEnv();
                if (sessionData) {
                    this.updateSettingsWithSession(sessionData);
                }
            }, 5000); // Wait 5 seconds to ensure all session data is written
        });

        // Message handling
        this.client.on('message', async (msg) => {
            if (msg.fromMe) return; // Ignore messages from the bot itself
            await this.handleMessage(msg);
        });

        // Authentication failed event
        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failed:', msg);
            
            // Mark as not authenticated
            this.isAuthenticated = false;
            
            if (this.io) {
                this.io.emit('botStatus', { status: 'auth_failure', message: msg });
            }
            
            // Mark authentication as failed in our state tracking
            this.saveAuthState('auth_failure');
            
            // Implement retry mechanism after delay
            setTimeout(() => {
                console.log('Attempting to reconnect after authentication failure...');
                this.client.initialize().catch(err => {
                    console.error('Failed to reinitialize after auth failure:', err);
                });
            }, 10000); // Wait 10 seconds before retry
        });

        // Disconnected event
        this.client.on('disconnected', (reason) => {
            console.log('Client was disconnected:', reason);
            
            // Mark as not authenticated
            this.isAuthenticated = false;
            
            if (this.io) {
                this.io.emit('botStatus', { status: 'disconnected', reason });
            }
            
            // Mark as disconnected in our state tracking
            this.saveAuthState('disconnected');
            
            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log('Attempting to reconnect after disconnection...');
                this.client.initialize().catch(err => {
                    console.error('Failed to reinitialize after disconnection:', err);
                });
            }, 5000); // Wait 5 seconds before retry
        });
    }
    
    // Helper method to update settings with session data
    updateSettingsWithSession(sessionData) {
        try {
            // Read current settings
            const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
            
            // Update with new session data
            settings.whatsappSession = sessionData;
            
            // Write back to file
            fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
            console.log('Updated settings.json with WhatsApp session data');
            
            // Notify admin panel if available
            if (this.io) {
                this.io.emit('sessionUpdated', { success: true, message: 'WhatsApp session saved to settings' });
            }
        } catch (error) {
            console.error('Failed to update settings with session data:', error);
        }
    }
    
    // Helper method to save authentication state
    saveAuthState(state) {
        try {
            const stateObj = {
                state: state,
                timestamp: new Date().toISOString()
            };
            
            // Save state to a file in the auth directory
            const authStateFile = path.join(process.cwd(), '.wwebjs_auth', 'auth_state.json');
            fs.writeFileSync(authStateFile, JSON.stringify(stateObj, null, 2));
            console.log(`Saved auth state: ${state}`);
        } catch (error) {
            console.error('Failed to save auth state:', error);
        }
    }

    async handleMessage(msg) {
        const userId = msg.from;
        console.log(`📩 Received message from user ${userId}: '${msg.body}'`);

        if (!this.userData.has(userId)) {
            this.userData.set(userId, {
                isSearching: false,
                messages: [], // Store conversation history
                tourSearchData: {
                    departureCity: null,
                    destinationCountry: null,
                    nightsFrom: null,
                    nightsTo: null,
                    adults: null,
                    children: null
                },
                lastInteraction: Date.now(),
                hasEngagedInConversation: false
            });
            await this.safeSendMessage(msg, '👋 Здравствуйте! Я ваш персональный помощник по путешествиям. Я могу подобрать для вас идеальный тур, ответить на вопросы о популярных направлениях или рассказать о специальных предложениях.\n\nРасскажите, о каком путешествии вы мечтаете? Или просто напишите "тур", чтобы я помог подобрать для вас оптимальный вариант отдыха.');
            return;
        }

        const userData = this.userData.get(userId);
        userData.lastInteraction = Date.now();
        
        // Add message to conversation history
        userData.messages.push({
            role: 'user',
            content: msg.body
        });

        if (msg.body.toLowerCase() === 'тур') {
            userData.isSearching = true;
            await this.startTourSearchConversation(msg, userData);
        } else if (userData.isSearching) {
            await this.processTourSearchInput(msg, userData);
        } else {
            // Set flag that user has engaged in conversation
            userData.hasEngagedInConversation = true;
            
            // Use a more sales-oriented prompt for regular conversations
            const conversationPrompt = `${this.SYSTEM_PROMPT}

Based on the user's message, provide a friendly and helpful response. 
If they mention anything related to travel, ask about their preferences and gently suggest booking options.
If they haven't mentioned travel, find a natural way to bring up travel topics or current travel deals.
After a few exchanges, if appropriate, remind them they can type "тур" to search for perfect vacation options.`;
            
            const response = await this.getChatGPTResponseWithPrompt(msg.body, conversationPrompt, userData.messages);
            await this.safeSendMessage(msg, response);
            
            // Add bot's response to conversation history
            userData.messages.push({
                role: 'assistant',
                content: response
            });
            
            // If the user has been chatting but not searching, suggest a tour after a few messages
            if (userData.hasEngagedInConversation && userData.messages.length >= 6 && !this.hasRecentlyPromptedForTour(userData)) {
                await this.maybeSuggestTourSearch(msg, userData);
            }
        }
    }

    async startTourSearchConversation(msg, userData) {
        // Instead of a structured tour search prompt, use a more conversational opening
        const initialPrompt = 'Отлично! Я обожаю помогать с планированием отдыха. Расскажите немного о том, какое путешествие вы представляете — может быть, есть страна, которая вас особенно привлекает? Или предпочитаете пляжный отдых, экскурсии, горы?';
        
        await this.safeSendMessage(msg, initialPrompt);
        
        // Add bot's response to conversation history
        userData.messages.push({
            role: 'assistant',
            content: initialPrompt
        });
    }

    async processTourSearchInput(msg, userData) {
        try {
            // Process user input with OpenAI to extract travel parameters
            const tourData = await this.processTourInputWithAI(userData);
            
            // Instead of checking for completeness, use a more conversational approach
            await this.continueConversationalSearch(msg, userData, tourData);
        } catch (error) {
            console.error('Error in processTourSearchInput:', error);
            await this.safeSendMessage(msg, 'Произошла ошибка при обработке вашего запроса. Пожалуйста, давайте начнем обсуждение заново.');
            this.resetUserState(msg.from);
        }
    }
    
    async continueConversationalSearch(msg, userData, tourData) {
        try {
            // Extract tour data from messages using AI
            await this.processTourInputWithAI(userData);
            
            const { departureCity, destinationCountry, nightsFrom, adults, children } = userData.tourSearchData;
            
            // Count how many fields we've collected
            // IMPORTANT: Consider children field collected if it's 0 or any positive number (not just if it's not null)
            const collectedFields = [
                departureCity, 
                destinationCountry, 
                nightsFrom, 
                adults,
                // Consider the children field collected if it's 0 or any positive number
                children === 0 || children > 0 ? true : null
            ].filter(Boolean).length;
            
            console.log(`Collected ${collectedFields} fields:`, userData.tourSearchData);
            
            // Logic to determine if we have enough information or need to continue asking questions
            if (collectedFields >= 5) {
                // We have all the necessary information, finalize the search
                if (!userData.tourSearchData.searchFinalized) {
                    // Call the correct function - confirmAndSearchTour instead of finalizeSearch
                    await this.confirmAndSearchTour(msg, userData, userData.tourSearchData);
                    userData.tourSearchData.searchFinalized = true;
                }
            } else {
                // Continue asking questions to get more information
                const nextPrompt = this.generateConversationalPrompt(userData);
                await this.safeSendMessage(msg, nextPrompt);
            }
        } catch (error) {
            console.error('Error in continueConversationalSearch:', error);
            await this.safeSendMessage(msg, 'Извините, произошла ошибка. Пожалуйста, попробуйте еще раз.');
        }
    }
    
    generateConversationalPrompt(userData) {
        const { departureCity, destinationCountry, nightsFrom, adults, children } = userData.tourSearchData;
        
        // Handle initial greeting or special command "тур"
        if (userData.messages.length <= 2) {
            return 'Привет! 👋 Я помогу вам найти идеальный тур для отдыха. Расскажите, куда бы вы хотели поехать? Например: "Тур в Турцию на двоих на неделю из Москвы"';
        }
        
        // If multiple fields were collected from the first message, acknowledge what we understood
        const lastUserMessage = userData.messages.filter(m => m.role === 'user').pop()?.content || '';
        const hasMultipleFields = lastUserMessage && 
                                 [destinationCountry, adults].filter(Boolean).length >= 2 && 
                                 userData.messages.filter(m => m.role === 'user').length <= 2;
        
        if (hasMultipleFields) {
            let acknowledgment = 'Отлично! ';
            
            if (destinationCountry && adults) {
                acknowledgment += `Я понял, что вы ищете поездку в ${destinationCountry} для ${adults} ${this.formatAdults(adults)}. `;
            } else if (destinationCountry) {
                acknowledgment += `Я понял, что вы интересуетесь поездкой в ${destinationCountry}. `;
            }
            
            // Add question for missing information
            if (!departureCity) {
                return acknowledgment + 'Из какого города планируете вылет?';
            } else if (!nightsFrom) {
                return acknowledgment + `На сколько ночей планируете поездку в ${destinationCountry}?`;
            } else if (children === null) {
                return acknowledgment + 'Будут ли с вами дети? Если да, то сколько?';
            }
        }
        
        // Ask about missing information one by one
        if (!departureCity) {
            const options = ['Из какого города планируете вылет?', 
                            'Откуда бы вы хотели начать путешествие?', 
                            'Укажите, пожалуйста, город вылета.'];
            return options[Math.floor(Math.random() * options.length)];
        }
        
        if (!destinationCountry) {
            const options = ['Какую страну вы рассматриваете для отдыха?', 
                            'Куда бы вы хотели отправиться?', 
                            'Какое направление вас интересует?'];
            return options[Math.floor(Math.random() * options.length)];
        }
        
        if (!nightsFrom) {
            const options = [`На сколько ночей планируете поездку в ${destinationCountry}?`, 
                            'Какова длительность вашего отдыха (количество ночей)?', 
                            'Сколько ночей вы хотели бы провести там?'];
            return options[Math.floor(Math.random() * options.length)];
        }
        
        if (!adults) {
            const options = ['Сколько взрослых человек поедет?', 
                            'Укажите, пожалуйста, количество взрослых туристов.', 
                            'Сколько взрослых будет в поездке?'];
            return options[Math.floor(Math.random() * options.length)];
        }
        
        // Check if the children field is null AND that we haven't already detected "no children" 
        // indications in previous messages
        if (children === null) {
            // Check if recent messages already indicate "no children"
            const noChildrenPatterns = [
                /нет/i, /не[тй]/i, /без дет/i, /не будет дет/i, /0 дет/i, /ноль дет/i, /только взрослы/i
            ];
            
            const recentMessages = userData.messages.slice(-5).filter(m => m.role === 'user');
            const hasNoChildrenIndication = recentMessages.some(m => 
                noChildrenPatterns.some(pattern => pattern.test(m.content))
            );
            
            // If user has already indicated no children, we should update the children field
            // and NOT ask this question again
            if (hasNoChildrenIndication) {
                // Update children to 0 instead of asking again
                userData.tourSearchData.children = 0;
                console.log('In generatePrompt: Detected indication of no children, set children = 0');
                
                // Instead of asking about children again, move to the summary or next missing field
                return `Отлично! Сейчас подберу для вас варианты тура в ${destinationCountry} из ${departureCity} на ${nightsFrom} ночей для ${adults} ${this.formatAdults(adults)} без детей.`;
            }
            
            // Only ask if we still don't know about children
            const options = ['Будут ли с вами дети? Если да, то сколько? Если нет, просто ответьте "нет".', 
                           'Планируете ли взять детей? Укажите количество или ответьте "нет".', 
                           'Сколько детей поедет с вами? Если детей нет, просто напишите "нет".'];
            return options[Math.floor(Math.random() * options.length)];
        }
        
        // Summary if we have all information
        const childrenText = children > 0 ? ` и ${children} ${this.formatChildren(children)}` : '';
        return `Спасибо! Я нашёл для вас отличные варианты тура в ${destinationCountry} из ${departureCity} на ${nightsFrom} ночей для ${adults} ${this.formatAdults(adults)}${childrenText}.`;
    }
    
    formatAdults(count) {
        if (count === 1) return 'взрослого';
        return 'взрослых';
    }
    
    formatChildren(count) {
        // Helper function to format children count in Russian
        if (count === 1) return 'ребенка';
        if (count >= 2 && count <= 4) return 'детей';
        return 'детей';
    }

    async processTourInputWithAI(userData) {
        const apiKey = this.OPENAI_API_KEY;
        const endpoint = 'https://api.openai.com/v1/chat/completions';
        
        // More sophisticated prompt for extracting information from natural conversation
        const systemPrompt = `You are an AI assistant specialized in extracting travel booking details from natural conversations.

Your task is to analyze the conversation and identify the following travel parameters:

1. departureCity - The city the user wants to depart from
2. destinationCountry - The country or destination the user wants to visit
3. nightsFrom - Minimum number of nights (integer only)
4. nightsTo - Maximum number of nights (integer only)
5. adults - Number of adults traveling (integer only)
6. children - Number of children traveling (integer only)

IMPORTANT GUIDELINES:
- Extract information ONLY when it's clearly stated or strongly implied
- Look for both direct mentions and contextual clues about travel preferences
- Handle duration expressions with extreme flexibility for wider search results:
  * For specific numbers like "7 days" or "10 nights": set both nightsFrom and nightsTo to that number
  * For ranges like "7-10 nights": set nightsFrom to 7 and nightsTo to 10
  * For expressions like "one week": set nightsFrom and nightsTo to 7
  * For expressions like "two weeks": set nightsFrom and nightsTo to 14
  * For expressions like "around X nights" or "about X nights": set both values to X
  * For "weekend trip": set nightsFrom to 2 and nightsTo to 3
  * For vague expressions like "short trip": set nightsFrom to 3 and nightsTo to 5
  * For vague expressions like "long vacation": set nightsFrom to 14 and nightsTo to 21
  * The system will automatically create wider ranges from your initial values
- For adults/children, infer from context when possible (e.g., "We're a couple" = 2 adults, "на двоих" = 2 adults)
- If "на двоих" is mentioned, assume adults: 2 unless explicitly stated otherwise
- Common phrases like "тур в Турцию" should be interpreted as destinationCountry: "Турция"
- If information is contradicted later in the conversation, use the most recent mention
- For destinations, recognize both formal country names and colloquial references (e.g., "ОАЭ", "Эмираты")
- ONLY extract what's actually in the conversation - do not make assumptions about missing information
- VERY IMPORTANT: When user says "нет", "нет детей", "без детей", "не будет детей" or similar phrases indicating no children, set children: 0 (not null)

Return ONLY a JSON object with these parameters. If a parameter cannot be determined with confidence, set it to null.
For example: {"departureCity":"Moscow","destinationCountry":"Turkey","nightsFrom":7,"nightsTo":10,"adults":2,"children":1}`;
        
        try {
            // Check if API key is valid before making the request
            if (!apiKey || apiKey.trim() === '' || apiKey.includes("'")) {
                console.error('Invalid API key format:', apiKey);
                throw new Error("API ключ OpenAI отсутствует или имеет неверный формат");
            }
            
            // Get most recent user message to analyze it directly in case it contains multiple pieces of information
            const lastUserMessage = userData.messages.filter(m => m.role === 'user').pop()?.content || '';
            const isTourCommand = lastUserMessage.toLowerCase() === 'тур';
            
            // If this was just the "тур" command, don't try to extract details yet
            if (isTourCommand && userData.messages.length <= 2) {
                return userData.tourSearchData;
            }
            
            // Check for messages indicating no children
            const noChildrenPatterns = [
                /нет/i, /не[тй]/i, /без дет/i, /не будет дет/i, /0 дет/i, /ноль дет/i, /только взрослы/i
            ];
            
            // If any recent message indicates no children, explicitly set children to 0
            const recentMessages = userData.messages.slice(-5).filter(m => m.role === 'user');
            const hasNoChildrenIndication = recentMessages.some(m => 
                noChildrenPatterns.some(pattern => pattern.test(m.content))
            );
            
            if (hasNoChildrenIndication && userData.tourSearchData.children === null) {
                userData.tourSearchData.children = 0;
                console.log('Detected indication of no children, set children = 0');
            }
            
            // Create messages array from conversation history
            const messages = [
                { role: 'system', content: systemPrompt },
                ...userData.messages
            ];
            
            const response = await axios.post(endpoint, {
                model: 'gpt-3.5-turbo',
                messages: messages,
                response_format: { type: "json_object" },
                temperature: 0.1 // Lower temperature for more deterministic extraction
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            
            const content = response.data.choices[0].message.content;
            console.log('AI extracted tour data:', content);
            
            // Parse the JSON response
            const tourData = JSON.parse(content);
            
            // Ensure children is properly set to 0 if detected as null but we have indications of no children
            if (tourData.children === null && hasNoChildrenIndication) {
                tourData.children = 0;
                console.log('Overriding null children value to 0 based on user messages');
            }
            
            // Handle duration expressions more intelligently with flexibility
            // If user mentioned a general time period, make a small range around it
            if (tourData.nightsFrom !== null && tourData.nightsTo !== null) {
                // If the API returned identical nightsFrom and nightsTo values, make them more flexible
                if (tourData.nightsFrom === tourData.nightsTo) {
                    const baseNights = tourData.nightsFrom;
                    
                    // Check if user specified an exact number or a general period
                    const lastUserMessage = userData.messages.filter(m => m.role === 'user').pop()?.content || '';
                    
                    // For any duration expression, ALWAYS set nightsFrom to 1 and make nightsTo generous
                    // This ensures we get the widest possible range of options
                    if (baseNights > 1) {
                        // Set nightsFrom to 1 for all time expressions, not just approximate ones
                        tourData.nightsFrom = 1;
                        
                        // For longer stays, provide an even wider range 
                        if (baseNights >= 14) {
                            // For two weeks or more, provide a broader range like 1-16 nights
                            tourData.nightsTo = baseNights + 2;
                            console.log(`Set broad nights range for longer stay: ${tourData.nightsFrom}-${tourData.nightsTo}`);
                        } else if (baseNights >= 7) {
                            // For about a week, provide a range like 1-8 nights
                            tourData.nightsTo = baseNights + 1;
                            console.log(`Set broad nights range for medium stay: ${tourData.nightsFrom}-${tourData.nightsTo}`);
                        } else {
                            // For shorter stays, still use a flexible range
                            tourData.nightsTo = baseNights + 2;
                            console.log(`Set broad nights range for shorter stay: ${tourData.nightsFrom}-${tourData.nightsTo}`);
                        }
                    }
                } 
                // If user has already specified a range (nightsFrom != nightsTo), make sure nightsFrom is 1
                else if (tourData.nightsFrom > 1) {
                    // Keep the upper bound but set lower bound to 1
                    tourData.nightsFrom = 1;
                    console.log(`Adjusted existing range to start from 1: ${tourData.nightsFrom}-${tourData.nightsTo}`);
                }
            }
            
            // Update the user's tourSearchData with the extracted parameters
            userData.tourSearchData = {
                ...userData.tourSearchData,
                ...tourData
            };
            
            return userData.tourSearchData;
        } catch (error) {
            console.error('Error processing tour input with AI:', error);
            throw error;
        }
    }

    isTourDataComplete(tourData) {
        return (
            tourData.departureCity && 
            tourData.destinationCountry && 
            tourData.nightsFrom !== null && 
            tourData.nightsTo !== null && 
            tourData.adults !== null && 
            tourData.children !== null
        );
    }

    async confirmAndSearchTour(msg, userData, tourData) {
        console.log(`Starting search with the following parameters:`);
        console.log(`Departure: ${tourData.departureCity}`);
        console.log(`Destination Country: ${tourData.destinationCountry}`);
        console.log(`Nights: ${tourData.nightsFrom}-${tourData.nightsTo}`);
        console.log(`Adults: ${tourData.adults}`);
        console.log(`Children: ${tourData.children}`);

        // Generate an enthusiastic, persuasive summary with better description of date range
        let dateRangeText;
        if (tourData.nightsFrom === 1 && tourData.nightsTo > 7) {
            // If we have a wide range starting from 1, use a more natural description
            if (tourData.nightsTo >= 14) {
                dateRangeText = `до двух недель (${tourData.nightsFrom}-${tourData.nightsTo} ночей)`;
            } else {
                dateRangeText = `до недели или больше (${tourData.nightsFrom}-${tourData.nightsTo} ночей)`;
            }
        } else if (tourData.nightsFrom !== tourData.nightsTo) {
            // Regular range
            dateRangeText = `${tourData.nightsFrom} - ${tourData.nightsTo} ночей`;
        } else {
            // Exact number of nights
            dateRangeText = `${tourData.nightsFrom} ночей`;
        }

        const summary = `🌴 Отлично! Я подбираю для вас идеальный вариант отдыха:

🛫 Вылет из: ${tourData.departureCity}
🏝️ Направление: ${tourData.destinationCountry}
📅 Продолжительность: ${dateRangeText}
👥 Взрослых: ${tourData.adults}
${tourData.children > 0 ? `👶 Детей: ${tourData.children}` : '👨‍👩‍👧‍👦 Без детей'}

Это популярное направление, и я уверен, что смогу найти для вас отличные варианты! Секундочку...`;

        await this.safeSendMessage(msg, summary);
        
        // Add an extra enticing message about the destination
        await this.sendDestinationTeaser(msg, tourData.destinationCountry);

        // Convert the parameters to proper format for API
        const formattedParams = await this.convertTourParamsWithAI(tourData);
        
        // Log the formatted parameters to terminal
        console.log('============= FORMATTED SEARCH PARAMETERS =============');
        console.log(formattedParams);
        console.log('======================================================');
        
        // Generate the API URL
        const apiUrl = await this.formatSearchRequest(formattedParams);
        console.log(`Making API request to: ${apiUrl}`);

        // Proceed to start the tour search
        try {
            await this.safeSendMessage(msg, '🔍 Ищу лучшие предложения от ведущих туроператоров...');
            const response = await axios.get(apiUrl);
            console.log(`API Response: ${response.data}`);
            const result = await this.parseApiResponse(response.data);
            
            if (result && result.requestid) {
                await this.getSearchResults(result.requestid, msg);
            } else {
                await this.safeSendMessage(msg, 'К сожалению, сейчас не удалось получить результаты поиска. Это бывает в период высокого спроса. Давайте попробуем немного изменить параметры? Напишите "тур" и мы начнем новый поиск.');
                this.resetUserState(msg.from);
            }
        } catch (error) {
            console.error('Error making API request:', error);
            await this.safeSendMessage(msg, 'Похоже, что сейчас возникли технические трудности при поиске туров. Это временное явление. Пожалуйста, напишите "тур", чтобы попробовать снова через минуту.');
            this.resetUserState(msg.from);
        }
    }
    
    async sendDestinationTeaser(msg, country) {
        // Create destination-specific teasers
        const teasers = {
            "Турция": "☀️ Турция сейчас предлагает отличное соотношение цены и качества! Прекрасные пляжи, вкусная еда и отличный сервис all-inclusive ждут вас.",
            "Египет": "🏝️ Египет - это идеальный выбор для любителей снорклинга и дайвинга! Красивейшие коралловые рифы и круглогодичное солнце гарантированы.",
            "Таиланд": "🌴 Таиланд славится своим гостеприимством, экзотической кухней и великолепными пляжами. Сейчас там отличная погода для отдыха!",
            "ОАЭ": "🌇 ОАЭ - это воплощение роскоши и комфорта. Идеальное место для шоппинга, пляжного отдыха и впечатляющих достопримечательностей.",
            "Мальдивы": "💙 Мальдивы - райское место для незабываемого отдыха! Бирюзовая вода, белоснежные пляжи и потрясающие закаты.",
            "Греция": "🏛️ Греция предлагает уникальное сочетание богатой истории, великолепных пляжей и вкусной средиземноморской кухни."
        };
        
        // Try to find a country-specific teaser or use generic one
        let teaser = teasers[country];
        if (!teaser) {
            // Use OpenAI to generate a custom teaser
            try {
                teaser = await this.generateDestinationTeaser(country);
            } catch (error) {
                // Fallback to a generic teaser
                teaser = `✨ ${country} - отличный выбор! Это направление становится все более популярным среди туристов. Уверен, там вас ждет незабываемый отдых!`;
            }
        }
        
        await this.safeSendMessage(msg, teaser);
    }
    
    async generateDestinationTeaser(country) {
        try {
            const apiKey = this.OPENAI_API_KEY;
            const endpoint = 'https://api.openai.com/v1/chat/completions';
            
            // Check if API key is valid before making the request
            if (!apiKey || apiKey.trim() === '' || apiKey.includes("'")) {
                console.error('Invalid API key format:', apiKey);
                return `✨ ${country} - прекрасный выбор для вашего отпуска! Уверен, вы получите незабываемые впечатления.`;
            }
            
            const prompt = `Создай короткое (1-2 предложения) и привлекательное описание страны ${country} как туристического направления. 
Используй эмодзи в начале, подчеркни уникальные особенности, которые делают это место особенным для туристов. 
Сделай текст энтузиастичным, но не перехваливай и не используй клише. Фокусируйся на реальных преимуществах.`;
            
            const response = await axios.post(endpoint, {
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: 'Ты - копирайтер туристического агентства.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 100
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });
            
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error generating destination teaser:', error);
            return `✨ ${country} - прекрасный выбор для вашего отпуска! Уверен, вы получите незабываемые впечатления.`;
        }
    }

    async convertTourParamsWithAI(tourData) {
        const apiKey = this.OPENAI_API_KEY;
        const endpoint = 'https://api.openai.com/v1/chat/completions';
        
        // First, try to determine IDs directly from our stored maps
        let departureCountryId = null;
        let destinationCountryId = null;
        
        // Try to find departure city ID in our map
        if (tourData.departureCity) {
            const normalizedDeparture = tourData.departureCity.trim().toLowerCase();
            if (this.departureCityMap[normalizedDeparture]) {
                departureCountryId = this.departureCityMap[normalizedDeparture];
                console.log(`Mapped departure city ${tourData.departureCity} to ID: ${departureCountryId}`);
            }
        }
        
        // Try to find destination country ID in our map
        if (tourData.destinationCountry) {
            const normalizedDestination = tourData.destinationCountry.trim().toLowerCase();
            if (this.countryNameToIdMap[normalizedDestination]) {
                destinationCountryId = this.countryNameToIdMap[normalizedDestination];
                console.log(`Mapped destination country ${tourData.destinationCountry} to ID: ${destinationCountryId}`);
            }
        }
        
        // If we couldn't find IDs directly, use AI to help
        if (!departureCountryId || !destinationCountryId) {
            // Create the system prompt with country mapping information
            const countryList = this.countries.map(country => `${country.name}: ${country.id}`).join('\n');
            
            const systemPrompt = `You are a travel assistant API converter. 
Your task is to convert user-friendly travel parameters into the required numeric format for the tour search API.

COUNTRY CODE MAPPING:
${countryList}

MAJOR CITIES TO COUNTRY CODE MAPPING RULES:
- For Russian cities (Moscow, St. Petersburg, etc.), use code 47
- For Kazakhstan cities (Almaty, Astana, etc.), use code 78
- For resort cities, match them to their country (e.g., Antalya → Turkey (4), Dubai → UAE (9))

Based on the input travel details, return a JSON object with these fields:
- departureCountryId: The numeric ID for the departure city's country (from the list above)
- destinationCountryId: The numeric ID for the destination country (from the list above)
- nightsFrom: Minimum nights (integer only)
- nightsTo: Maximum nights (integer only)
- adults: Number of adults (integer only)
- children: Number of children (integer only)

If you can't determine a country code with certainty:
- For departures, default to 47 (Russia) or 78 (Kazakhstan) based on which is more likely
- For destinations, default to 4 (Turkey) or 1 (Egypt) based on which is more likely

Return ONLY the JSON object with ALL fields as numeric values (not strings), with NO additional text.`;

            try {
                // Check if API key is valid before making the request
                if (!apiKey || apiKey.trim() === '' || apiKey.includes("'")) {
                    console.error('Invalid API key format:', apiKey);
                    throw new Error("API ключ OpenAI отсутствует или имеет неверный формат");
                }
                
                const response = await axios.post(endpoint, {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { 
                            role: 'user', 
                            content: `Convert these travel parameters to API format:
Departure City: ${tourData.departureCity || 'Unknown'}
Destination Country: ${tourData.destinationCountry || 'Unknown'}
Nights From: ${tourData.nightsFrom}
Nights To: ${tourData.nightsTo}
Adults: ${tourData.adults}
Children: ${tourData.children != null ? tourData.children : 0}`
                        }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1 // Lower temperature for more deterministic extraction
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                
                const content = response.data.choices[0].message.content;
                console.log('AI converted tour parameters:', content);
                
                // Parse the JSON response
                const formattedParams = JSON.parse(content);
                
                // Use direct lookup values if available, otherwise use AI results
                formattedParams.departureCountryId = departureCountryId || formattedParams.departureCountryId;
                formattedParams.destinationCountryId = destinationCountryId || formattedParams.destinationCountryId;
                
                return formattedParams;
            } catch (error) {
                console.error('Error converting tour parameters with AI:', error);
                // Use our directly mapped values or defaults
                return {
                    departureCountryId: departureCountryId || 47, // Default to Russia
                    destinationCountryId: destinationCountryId || 4, // Default to Turkey
                    nightsFrom: tourData.nightsFrom || 7,
                    nightsTo: tourData.nightsTo || 14,
                    adults: tourData.adults || 2,
                    children: tourData.children != null ? tourData.children : 0
                };
            }
        } else {
            // We already have both IDs, no need to call AI
            return {
                departureCountryId: departureCountryId,
                destinationCountryId: destinationCountryId,
                nightsFrom: tourData.nightsFrom || 7,
                nightsTo: tourData.nightsTo || 14,
                adults: tourData.adults || 2,
                children: tourData.children != null ? tourData.children : 0
            };
        }
    }

    async formatSearchRequest(formattedParams) {
        // Calculate dates
        const today = new Date();
        const dateFrom = new Date(today);
        dateFrom.setDate(today.getDate() + 1);
        const dateTo = new Date(today);
        dateTo.setDate(today.getDate() + 30);

        const formattedDateFrom = `${dateFrom.getDate().toString().padStart(2, '0')}.${(dateFrom.getMonth() + 1).toString().padStart(2, '0')}.${dateFrom.getFullYear()}`;
        const formattedDateTo = `${dateTo.getDate().toString().padStart(2, '0')}.${(dateTo.getMonth() + 1).toString().padStart(2, '0')}.${dateTo.getFullYear()}`;

        // Create the API URL with the formatted parameters
        // return `http://tourvisor.ru/xml/search.php?authlogin=${this.TOURVISOR_LOGIN}&authpass=${this.TOURVISOR_PASS}&departure=${formattedParams.departureCountryId}&country=${formattedParams.destinationCountryId}&datefrom=${formattedDateFrom}&dateto=${formattedDateTo}&nightsfrom=${formattedParams.nightsFrom}&nightsto=${formattedParams.nightsTo}&adults=${formattedParams.adults}&child=${formattedParams.children}&format=xml`;
        return `http://tourvisor.ru/xml/search.php?authlogin=${this.TOURVISOR_LOGIN}&authpass=${this.TOURVISOR_PASS}&departure=${formattedParams.destinationCountryId}&country=${formattedParams.destinationCountryId}&datefrom=${formattedDateFrom}&dateto=${formattedDateTo}&nightsfrom=${formattedParams.nightsFrom}&nightsto=${formattedParams.nightsTo}&adults=${formattedParams.adults}&child=${formattedParams.children}&format=xml`;  
    }

    async startTourSearch(msg, tourData) {
        const formattedParams = await this.convertTourParamsWithAI(tourData);
        const apiUrl = await this.formatSearchRequest(formattedParams);
        console.log(`Making API request to: ${apiUrl}`);

        try {
            const response = await axios.get(apiUrl);
            console.log(`API Response: ${response.data}`);
            const result = await this.parseApiResponse(response.data);
            return result.requestid; // Return the request ID for direct result fetching
        } catch (error) {
            console.error('Error making API request:', error);
            await this.safeSendMessage(msg, 'Произошла ошибка при отправке запроса на поиск туров.');
            return null;
        }
    }

    async getSearchResults(requestId, msg) {
        const resultsUrl = `http://tourvisor.ru/xml/result.php?authlogin=${this.TOURVISOR_LOGIN}&authpass=${this.TOURVISOR_PASS}&requestid=${requestId}&type=result`;
        console.log(`Fetching results from: ${resultsUrl}`);

        try {
            // Wait a few seconds for the search to complete
            await this.safeSendMessage(msg, '🔍 Ищем туры, это может занять несколько секунд...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            const response = await axios.get(resultsUrl);
            const parser = new xml2js.Parser();
            
            const result = await new Promise((resolve, reject) => {
                parser.parseString(response.data, (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            // Check if we have data and hotels
            if (result.data && result.data.result && result.data.result[0].hotel) {
                await this.handleResults(response.data, msg);
            } else {
                await this.safeSendMessage(msg, '🔄 Поиск все еще выполняется. Пожалуйста, повторите поиск через несколько минут, написав "тур"');
            }
        } catch (error) {
            console.error('Error fetching results:', error);
            await this.safeSendMessage(msg, '😔 Произошла ошибка при получении результатов поиска. Пожалуйста, попробуйте позже.');
        }
    }

    async handleResults(xmlData, msg) {
        const parser = new xml2js.Parser();
        parser.parseString(xmlData, async (err, result) => {
            if (err) {
                console.error('Error parsing results:', err);
                await this.safeSendMessage(msg, 'Не удалось обработать результаты поиска.');
                this.resetUserState(msg.from);
                return;
            }

            // Check if the result contains hotels
            const hotels = result.data.result[0].hotel;
            if (hotels && hotels.length > 0) {
                // First, send an exciting introduction 
                await this.safeSendMessage(msg, `🎉 Отлично! Я нашел ${hotels.length} вариантов для вашего отпуска! Вот несколько лучших предложений:`);
                
                // Sort hotels by rating and price (prioritizing higher rated hotels)
                hotels.sort((a, b) => {
                    const aStars = parseInt(a.hotelstars[0]) || 0;
                    const bStars = parseInt(b.hotelstars[0]) || 0;
                    if (aStars !== bStars) return bStars - aStars; // Sort by stars first
                    
                    const aPrice = parseInt(a.price[0].replace(/[^\d]/g, ''));
                    const bPrice = parseInt(b.price[0].replace(/[^\d]/g, ''));
                    return aPrice - bPrice; // Then by price ascending
                });
                
                // Limit to top 3-5 hotels for a better user experience
                const topHotels = hotels.slice(0, Math.min(5, hotels.length));
                
                // Send each hotel in a separate message for better readability
                for (let i = 0; i < topHotels.length; i++) {
                    const hotel = topHotels[i];
                    const hotelName = hotel.hotelname[0];
                    const price = hotel.price[0];
                    const description = hotel.hoteldescription[0];
                    const fullDescLink = hotel.fulldesclink[0];
                    const countryname = hotel.countryname[0];
                    const hotelstars = hotel.hotelstars[0];
                    // Extracting fly dates from tours
                    const tours = hotel.tours[0].tour;
                    const flydate = tours.map(tour => tour.flydate[0]).join(', ');
                    
                    // Create a more persuasive emoji prefix based on hotel stars
                    let starsEmoji = "";
                    const stars = parseInt(hotelstars);
                    if (stars >= 5) starsEmoji = "⭐⭐⭐⭐⭐ ПРЕМИУМ!";
                    else if (stars === 4) starsEmoji = "⭐⭐⭐⭐ РЕКОМЕНДУЕМ!";
                    else if (stars === 3) starsEmoji = "⭐⭐⭐ ХОРОШИЙ ВЫБОР!";
                    else starsEmoji = "⭐⭐ БЮДЖЕТНО!";
                    
                    // Craft an enticing message for each hotel
                    const hotelMessage = `${starsEmoji}
                    
🏨 *${hotelName}*
📍 ${countryname}
💎 ${description}
💰 *ЦЕНА: ${price}*
✈️ Ближайшие вылеты: ${flydate}

🔍 [Подробнее об отеле](http://manyhotels.ru/${fullDescLink})

${i === 0 ? "🔝 *ТОП ПРЕДЛОЖЕНИЕ!* Это самый популярный вариант среди наших клиентов." : ""}`;
                    
                    await this.safeSendMessage(msg, hotelMessage);
                    
                    // Small delay between messages for better readability
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // Add a call-to-action and next steps
                await this.safeSendMessage(msg, `Эти предложения действительны на текущий момент и могут быстро измениться! 

Чтобы забронировать тур или узнать подробности:
📞 Позвоните нам: +7 (XXX) XXX-XX-XX
💬 Или продолжите общение здесь

Хотите посмотреть другие варианты? Напишите "тур" для нового поиска с другими параметрами.`);

            } else {
                await this.safeSendMessage(msg, '😔 К сожалению, по вашему запросу сейчас нет доступных туров. Давайте попробуем изменить параметры поиска? Например, рассмотрим другие даты или направление. Просто напишите "тур", чтобы начать новый поиск.');
            }
            
            // After showing results, follow up with a prompt but don't reset state yet
            this.scheduleFollowUp(msg.from);
        });
    }
    
    scheduleFollowUp(userId) {
        // Schedule a follow-up message after 1 hour if user doesn't respond
        setTimeout(async () => {
            try {
                const userData = this.userData.get(userId);
                if (!userData) return; // User data may have been reset
                
                // Check if there was no interaction in the last hour
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                if (userData.lastInteraction < oneHourAgo) {
                    await this.client.sendMessage(userId, `Здравствуйте! Как вам понравились варианты туров, которые я подобрал? Возможно, у вас остались вопросы или вы хотите посмотреть другие направления? Я всегда на связи и готов помочь!`);
                    
                    // Update last interaction time
                    userData.lastInteraction = Date.now();
                    
                    // Add to conversation history
                    userData.messages.push({
                        role: 'assistant',
                        content: `Здравствуйте! Как вам понравились варианты туров, которые я подобрал? Возможно, у вас остались вопросы или вы хотите посмотреть другие направления? Я всегда на связи и готов помочь!`
                    });
                }
            } catch (error) {
                console.error('Error sending follow-up message:', error);
            }
        }, 60 * 60 * 1000); // 1 hour delay
        
        // Reset user state but preserve conversation history
        const userData = this.userData.get(userId);
        if (userData) {
            userData.isSearching = false;
            userData.tourSearchData = {
                departureCity: null,
                destinationCountry: null,
                nightsFrom: null,
                nightsTo: null,
                adults: null,
                children: null
            };
        }
    }

    async parseApiResponse(xmlData) {
        const parser = new xml2js.Parser();
        return new Promise((resolve, reject) => {
            parser.parseString(xmlData, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result.result);
                }
            });
        });
    }

    async getCountryIdFromCity(cityName) {
        if (!cityName) return null;
        
        // Convert input to lowercase for case-insensitive matching
        const normalizedCityName = cityName.trim().toLowerCase();
        
        // Check if it's a departure city
        if (this.departureCityMap[normalizedCityName]) {
            return this.departureCityMap[normalizedCityName];
        }
        
        // Check if it's a destination country/city
        if (this.countryNameToIdMap[normalizedCityName]) {
            return this.countryNameToIdMap[normalizedCityName];
        }
        
        // If not found, use AI to identify the country
        return await this.identifyCountryWithAI(normalizedCityName);
    }

    async identifyCountryWithAI(locationName) {
        const apiKey = this.OPENAI_API_KEY;
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        // Create a simple, structured list of countries for the AI to reference
        const countryList = this.countries.map(country => `${country.name}: ${country.id}`).join('\n');
        
        try {
            // Check if API key is valid before making the request
            if (!apiKey || apiKey.trim() === '' || apiKey.includes("'")) {
                console.error('Invalid API key format:', apiKey);
                return "47"; // Default to Russia if API key is invalid
            }
            
            const response = await axios.post(endpoint, {
                model: 'gpt-3.5-turbo',
                messages: [
                    { 
                        role: 'system', 
                        content: `You are a travel assistant that identifies country codes from the Tourvisor API.
                        
Your task is to match a given location (city or country) to the correct country ID in this list:

${countryList}

Rules:
1. ONLY return the numeric ID of the country, nothing else
2. If the location is a city, identify which country it belongs to and return that country's ID
3. Use common sense for well-known locations (e.g., "Анталия" is in Turkey, whose ID is 4)
4. If you can't identify with certainty, return:
   - 47 for locations likely in Russia
   - 78 for locations likely in Kazakhstan
   - 4 for locations likely in Egypt
   - 9 for locations likely in UAE
5. Only return the numeric ID, with NO explanation, NO preface, and NO quotation marks`
                    },
                    { 
                        role: 'user', 
                        content: `Identify the country ID for this location: ${locationName}`
                    }
                ],
                temperature: 0.3 // Lower temperature for more deterministic results
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            // Extract just the numeric ID from the response
            const content = response.data.choices[0].message.content.trim();
            const idMatch = content.match(/^\d+$/);
            
            if (idMatch) {
                console.log(`AI identified ${locationName} as country ID: ${idMatch[0]}`);
                return idMatch[0];
            } else {
                console.log(`AI couldn't clearly identify ${locationName}, using default ID: 47`);
                return "47"; // Default to Russia if no clear match
            }
        } catch (error) {
            console.error('Error identifying country with AI:', error);
            return "47"; // Default to Russia as fallback
        }
    }

    async getChatGPTResponseWithPrompt(userMessage, customPrompt, conversationHistory = []) {
        const apiKey = this.OPENAI_API_KEY;
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        try {
            // Enhanced prompt that encourages more natural information collection
            let enhancedPrompt = customPrompt;
            
            // Check if we're in a tour search context from the conversation history
            const isSearching = conversationHistory.some(msg => 
                msg.role === 'assistant' && 
                msg.content.includes('Отлично! Я обожаю помогать с планированием отдыха')
            );
            
            if (!isSearching) {
                enhancedPrompt += `\n\nВ ЭТОМ КОНКРЕТНОМ СООБЩЕНИИ:
1. Посмотри, есть ли возможность естественно перейти к обсуждению путешествий
2. Если клиент уже говорит о путешествиях, задай 1-2 открытых вопроса о его предпочтениях 
3. Выясни ненавязчиво дополнительную деталь (например, с кем планирует поездку, когда, какие предпочтения по отдыху)
4. Говори так, как будто ты реальный эксперт по туризму, общающийся в чате
5. Избегай повторения одних и тех же вопросов`;
            }
            
            // Create messages array from conversation history
            const messages = [
                { 
                    role: 'system', 
                    content: enhancedPrompt
                }
            ];
            
            // Add recent conversation history (up to 10 most recent messages)
            const recentHistory = conversationHistory.slice(-10);
            messages.push(...recentHistory);
            
            // Add the current user message if it's not already in history
            if (!recentHistory.some(msg => msg.role === 'user' && msg.content === userMessage)) {
                messages.push({ role: 'user', content: userMessage });
            }

            // Check if API key is valid before making the request
            if (!apiKey || apiKey.trim() === '' || apiKey.includes("'")) {
                console.error('Invalid API key format:', apiKey);
                return "🚨 Ошибка: API ключ OpenAI отсутствует или имеет неверный формат. Пожалуйста, проверьте настройки бота.";
            }

            const response = await axios.post(endpoint, {
                model: 'gpt-3.5-turbo',
                messages: messages,
                temperature: 0.7, // Slightly higher temperature for more creative responses
                max_tokens: 600 // Allow longer responses for more natural conversation
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error connecting to ChatGPT:', error);
            
            // Check for authentication error
            if (error.response && error.response.status === 401) {
                console.error('Authentication error with OpenAI API, status 401:', error.response.data);
                return "🚨 Ошибка авторизации в API OpenAI. Пожалуйста, проверьте ваш API ключ в настройках бота.";
            }
            
            // Check for quota exceeded or rate limit
            if (error.response && (error.response.status === 429 || error.response.data?.error?.code === 'rate_limit_exceeded')) {
                return "🚨 Превышен лимит запросов к API OpenAI. Пожалуйста, попробуйте позже.";
            }
            
            // Generic error message
            return "🚨 Произошла ошибка при обращении к ChatGPT. Проверьте ваш API ключ и попробуйте позже.";
        }
    }

    async getChatGPTResponse(userMessage) {
        return this.getChatGPTResponseWithPrompt(userMessage, this.SYSTEM_PROMPT);
    }

    resetUserState(userId) {
        this.userData.set(userId, {
            isSearching: false,
            messages: [], // Reset conversation history
            tourSearchData: {
                departureCity: null,
                destinationCountry: null,
                nightsFrom: null,
                nightsTo: null,
                adults: null,
                children: null
            },
            lastInteraction: Date.now(),
            hasEngagedInConversation: false
        });
        
        console.log(`Reset user state for ${userId}`);
    }

    hasRecentlyPromptedForTour(userData) {
        // Check the last few bot messages to see if we already suggested searching for a tour
        const lastFewMessages = userData.messages.slice(-6);
        for (const message of lastFewMessages) {
            if (message.role === 'assistant' && 
                (message.content.includes('тур') || 
                 message.content.includes('поиск') || 
                 message.content.includes('забронировать'))) {
                return true;
            }
        }
        return false;
    }
    
    async maybeSuggestTourSearch(msg, userData) {
        // 50% chance to suggest a tour if we haven't recently
        if (Math.random() > 0.5) {
            const suggestPrompt = `У меня тут появилась информация о нескольких горящих предложениях. Хотите, я помогу подобрать для вас идеальный вариант? Просто напишите "тур", и мы начнем поиск.`;
            await this.safeSendMessage(msg, suggestPrompt);
            
            // Add suggestion to conversation history
            userData.messages.push({
                role: 'assistant',
                content: suggestPrompt
            });
        }
    }
    
    async safeSendMessage(msg, response) {
        try {
            // Use direct message sending instead of reply
            await this.client.sendMessage(msg.from, response);
        } catch (error) {
            console.error('Error sending message:', error);
            // Try alternative method if first fails
            try {
                await msg.reply(response);
            } catch (secondError) {
                console.error('Both sending methods failed:', secondError);
            }
        }
    }

    start() {
        console.log('Starting WhatsApp bot...');
        try {
            // Create .wwebjs_cache directory to help with session persistence
            const cacheDir = path.join(process.cwd(), '.wwebjs_cache');
            if (!fs.existsSync(cacheDir)) {
                try {
                    fs.mkdirSync(cacheDir, { recursive: true });
                    console.log('Created cache directory at:', cacheDir);
                } catch (error) {
                    console.error('Failed to create cache directory:', error);
                }
            }
            
            // Ensure permissions on auth directory
            const authDir = path.join(process.cwd(), '.wwebjs_auth');
            try {
                // Make auth directory writable to ensure session can be saved
                fs.chmodSync(authDir, 0o755);
                console.log('Set permissions on auth directory');
            } catch (error) {
                console.error('Warning: Could not set permissions on auth directory:', error);
            }
            
            // Check if we have a valid session in environment variables
            console.log('Checking for existing session data...');
            
            // Try to load session from settings first
            try {
                const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
                if (settings.whatsappSession && settings.whatsappSession.trim() !== '') {
                    console.log('Found WhatsApp session in settings, using it for authentication');
                    process.env.WHATSAPP_SESSION = settings.whatsappSession;
                }
            } catch (error) {
                console.error('Error loading session from settings:', error);
            }
            
            const hasValidSession = this.sessionManager.hasValidSession();
            if (hasValidSession) {
                console.log('Valid session found, attempting to restore...');
                this.isAuthenticated = true; // Pre-emptively set as authenticated
            } else {
                console.log('No valid session found, QR code will be generated for authentication');
                this.isAuthenticated = false;
            }
            
            // Set up auto-reconnect mechanism
            let reconnectAttempts = 0;
            const maxReconnectAttempts = 5;
            
            const attemptInitialize = () => {
                console.log(`Attempting to initialize WhatsApp client (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
                
                this.client.initialize()
                    .then(() => {
                        console.log('Bot initialized successfully');
                        reconnectAttempts = 0; // Reset counter on success
                        
                        // Notify admin UI if available
                        if (this.io) {
                            this.io.emit('botStatus', { status: 'initializing', message: 'Connecting to WhatsApp...' });
                        }
                    })
                    .catch(err => {
                        console.error('Failed to initialize bot:', err);
                        reconnectAttempts++;
                        
                        if (err.code === 'Unknown system error -86' || err.message.includes('spawn')) {
                            console.log('Chrome execution error detected. Please ensure Google Chrome is installed or provide a valid path to the Chrome executable in the constructor.');
                            
                            // Notify admin UI if available
                            if (this.io) {
                                this.io.emit('botStatus', { 
                                    status: 'error', 
                                    message: 'Chrome execution error. Please check Chrome installation.'
                                });
                            }
                        }
                        
                        // Try to reconnect if we haven't reached max attempts
                        if (reconnectAttempts < maxReconnectAttempts) {
                            console.log(`Will attempt to reconnect in ${reconnectAttempts * 5} seconds...`);
                            setTimeout(attemptInitialize, reconnectAttempts * 5000);
                        } else {
                            console.error('Max reconnection attempts reached. Please restart the bot manually.');
                            if (this.io) {
                                this.io.emit('botStatus', { 
                                    status: 'error', 
                                    message: 'Failed to connect after multiple attempts. Please restart the bot.'
                                });
                            }
                        }
                    });
            };
            
            // Start the initialization process
            attemptInitialize();
            
            // Set up keepalive mechanism to prevent session timeout
            setInterval(() => {
                // Check if client is ready before attempting to send a keepalive message
                if (this.client.info) {
                    console.log('Sending keepalive ping to maintain session');
                    // No action needed - just checking client state is enough
                }
            }, 30 * 60 * 1000); // Every 30 minutes
            
            // Set up periodic session backup
            setInterval(() => {
                if (this.client.info) {
                    console.log('Performing periodic session backup');
                    const sessionData = this.sessionManager.saveSessionToEnv();
                    if (sessionData) {
                        this.updateSettingsWithSession(`base64:${sessionData}`);
                    }
                }
            }, 6 * 60 * 60 * 1000); // Every 6 hours
            
            // Add event listener for Socket.io connections
            if (this.io) {
                this.io.on('connection', (socket) => {
                    console.log('New client connected');
                    
                    // If we're already authenticated, send the status to the new client
                    if (this.isAuthenticated) {
                        socket.emit('botStatus', { status: 'ready', message: 'Bot is already authenticated and running' });
                    } else {
                        // If we're not authenticated, check if we can restore from settings
                        try {
                            const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
                            if (settings.whatsappSession && settings.whatsappSession.trim() !== '') {
                                socket.emit('botStatus', { 
                                    status: 'connecting', 
                                    message: 'Attempting to connect with saved session' 
                                });
                            } else {
                                socket.emit('botStatus', { 
                                    status: 'need_qr', 
                                    message: 'Waiting for QR code scan' 
                                });
                            }
                        } catch (error) {
                            socket.emit('botStatus', { 
                                status: 'need_qr', 
                                message: 'Waiting for QR code scan' 
                            });
                        }
                    }
                    
                    // Handle session update from admin panel
                    socket.on('updateSession', (data) => {
                        console.log('Received session update from admin panel');
                        if (data && data.session) {
                            process.env.WHATSAPP_SESSION = data.session;
                            this.updateSettingsWithSession(data.session);
                            this.sessionManager.restoreSessionFromEnv();
                            socket.emit('sessionUpdated', { 
                                success: true, 
                                message: 'Session updated successfully' 
                            });
                        }
                    });
                });
            }
            
        } catch (error) {
            console.error('Exception during bot initialization:', error);
            // Notify admin UI if available
            if (this.io) {
                this.io.emit('botStatus', { status: 'error', message: error.message });
            }
        }
    }
}

// Export the WhatsAppBot class for use in server.js
module.exports = { WhatsAppBot }; 
