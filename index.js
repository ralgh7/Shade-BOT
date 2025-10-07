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
// Listen for interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'redeem') return;

    // We will try to handle everything within one main block.
    try {
        // Step 1: Defer the reply immediately. This sends the "Bot is thinking..." message.
        await interaction.deferReply({ flags: 64 }); // 64 is the flag for an ephemeral reply

        const key = interaction.options.getString('key');
        const user = interaction.user;
        const member = interaction.member;

        // Step 2: Make the API call
        const response = await axios.post(
            'https://keyauth.win/api/1.2/',
            new URLSearchParams({
                type: 'license',
                key: key,
                ownerid: KEYAUTH_OWNER_ID,
                name: KEYAUTH_APP_NAME,
                sessionid: require('crypto').randomBytes(16).toString('hex'),
                user: user.id
            }),
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': KEYAUTH_APP_SECRET
                }
            }
        );

        const data = response.data;

        // Step 3: Handle the API response (Success or Failure)
        if (data.success) {
            const role = await interaction.guild.roles.fetch(BUYER_ROLE_ID);
            if (role) {
                await member.roles.add(role);
                // We EDIT the original "thinking..." message with the success response.
                await interaction.editReply({ content: '✅ Success! Your key has been redeemed and the buyer role has been assigned.' });
                await user.send(`Thank you! Your key \`${key}\` was successfully redeemed in "${interaction.guild.name}".`).catch(() => {});
            } else {
                await interaction.editReply({ content: '⚠️ Key was valid, but I could not find the buyer role to assign. Please contact an admin.' });
            }
        } else {
            // If KeyAuth says the key is invalid, we EDIT the reply.
            await interaction.editReply({ content: `❌ Redemption failed: ${data.message}` });
        }
    } catch (error) {
        console.error('An error occurred during the redeem interaction:', error);

        // Step 4: If ANY error occurs, we CATCH it and EDIT the reply with an error message.
        // We check if a reply has already been sent to avoid another crash.
        if (!interaction.replied && !interaction.deferred) {
            // This is a fallback, but unlikely to be needed with our structure.
            await interaction.reply({ content: 'An unexpected error occurred. Please try again.', flags: 64 });
        } else {
            await interaction.editReply({ content: 'An unexpected error occurred. Please try again.' });
        }
    }
});

// Log in to Discord
client.login(TOKEN);
