// Import necessary libraries
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// Get credentials from environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;

// KeyAuth Credentials
const KEYAUTH_OWNER_ID = process.env.KEYAUTH_OWNER_ID;
const KEYAUTH_APP_NAME = process.env.KEYAUTH_APP_NAME;
const KEYAUTH_APP_SECRET = process.env.KEYAUTH_APP_SECRET;

// Create a new Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Variable to store our KeyAuth session data
let keyauthSession = null;

// Function to initialize the connection with KeyAuth
async function initializeKeyAuth() {
    try {
        console.log('Initializing KeyAuth session...');
        const response = await axios.post(
            'https://keyauth.win/api/1.2/',
            new URLSearchParams({
                type: 'init',
                ownerid: KEYAUTH_OWNER_ID,
                name: KEYAUTH_APP_NAME,
                secret: KEYAUTH_APP_SECRET
            })
        );

        const data = response.data;
        if (data.success) {
            keyauthSession = data;
            console.log('✅ KeyAuth session initialized successfully!');
        } else {
            console.error(`❌ KeyAuth initialization failed: ${data.message}`);
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Critical error during KeyAuth initialization:', error.message);
        process.exit(1);
    }
}

// Define the slash command
const commands = [
    new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Redeem a key to get your buyer role.')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('The key you received upon purchase.')
                .setRequired(true))
        .toJSON(),
];

// When the bot is ready, register commands AND initialize KeyAuth
client.on(Events.ClientReady, async () => {
    await initializeKeyAuth();

    try {
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(client.application.id, GUILD_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error reloading commands:', error);
    }
    console.log(`Logged in as ${client.user.tag}!`);
});

// Listen for interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'redeem') return;

    // Defer the reply immediately to prevent "Unknown Interaction" errors
    await interaction.deferReply({ ephemeral: true });

    try {
        if (!keyauthSession) {
            await interaction.editReply({ content: '❌ The authentication service is currently unavailable. Please try again later.' });
            return;
        }

        if (interaction.member.roles.cache.has(BUYER_ROLE_ID)) {
            await interaction.editReply({
                content: 'You already have the buyer role and cannot redeem another key.'
            });
            return;
        }

        const key = interaction.options.getString('key');
        const user = interaction.user;
        
        const response = await axios.post(
            'https://keyauth.win/api/1.2/',
            new URLSearchParams({
                type: 'license',
                key: key,
                sessionid: keyauthSession.sessionid,
                ownerid: KEYAUTH_OWNER_ID,
                name: KEYAUTH_APP_NAME,
                secret: KEYAUTH_APP_SECRET,
                user: user.id
            })
        );

        const data = response.data;
        // Log the full response from KeyAuth to the console for debugging
        console.log('KeyAuth API Response:', data);

        if (data.success) {
            const role = await interaction.guild.roles.fetch(BUYER_ROLE_ID);
            if (role) {
                await interaction.member.roles.add(role);
                await interaction.editReply({ content: '✅ Success! Your key has been redeemed and the buyer role has been assigned.' });
                await user.send(`Thank you! Your key \`${key}\` was successfully redeemed in "${interaction.guild.name}".`).catch(() => {});
            } else {
                await interaction.editReply({ content: '⚠️ Key was valid, but I could not find the buyer role to assign. Please contact an admin.' });
            }
        } else {
            await interaction.editReply({ content: `❌ Redemption failed: ${data.message}` });
        }
    } catch (error) {
        console.error('An error occurred during the redeem interaction:', error);
        await interaction.editReply({ content: 'An unexpected error occurred while processing your command.' }).catch(console.error);
    }
});

// Log in to Discord
client.login(TOKEN);
