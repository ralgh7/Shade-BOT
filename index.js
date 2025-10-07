// Import necessary libraries
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// Get credentials from environment variables
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;

// KeyAuth Credentials
const KEYAUTH_OWNER_ID = process.env.KEYAUTH_OWNER_ID;
const KEYAUTH_APP_NAME = process.env.KEYAUTH_APP_NAME;
const KEYAUTH_APP_SECRET = process.env.KEYAUTH_APP_SECRET; // Renamed for clarity

// Create a new Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Define the slash command (no change here)
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

// Register slash commands with Discord when the bot is ready
client.on('ready', async () => {
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
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'redeem') return;
    // Try to defer the reply, but if it fails (because it timed out), catch the error and stop.
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (error) {
        console.error("Failed to defer reply, likely due to interaction timeout:", error);
        return; // Stop executing if we can't respond
    }
    const key = interaction.options.getString('key');
    const user = interaction.user;
    const member = interaction.member;

    await interaction.deferReply({ ephemeral: true });

    try {
        // *** THIS IS THE CORRECTED API CALL SECTION ***
        const response = await axios.post(
            'https://keyauth.win/api/1.2/',
            new URLSearchParams({
                type: 'license',
                key: key,
                ownerid: KEYAUTH_OWNER_ID,
                name: KEYAUTH_APP_NAME,
                sessionid: client.user.id, // A unique session ID, bot's ID is fine
                user: user.id // Pass the Discord User ID
            }),
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': KEYAUTH_APP_SECRET // Pass the secret in the Authorization header
                }
            }
        );
        // *** END OF CORRECTED SECTION ***

        const data = response.data;

        if (data.success) {
            const role = await interaction.guild.roles.fetch(BUYER_ROLE_ID);
            if (role) {
                await member.roles.add(role);
                await interaction.editReply({ content: '✅ Success! Your key has been redeemed and the buyer role has been assigned.' });
                await user.send(`Thank you for your purchase! Your key \`${key}\` was successfully redeemed in "${interaction.guild.name}".`).catch(() => {});
            } else {
                await interaction.editReply({ content: '⚠️ Key was valid, but I could not find the buyer role to assign. Please contact an admin.' });
            }
        } else {
            await interaction.editReply({ content: `❌ Redemption failed: ${data.message}` });
        }
    } catch (error) {
        console.error('API Error:', error.response ? error.response.data : error.message);
        await interaction.editReply({ content: 'An unexpected error occurred while contacting the authentication server. Please try again later.' });
    }
});

// Log in to Discord
client.login(TOKEN);
