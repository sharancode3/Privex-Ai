/**
 * Chat Engine Core
 * 
 * Business logic for chat operations.
 * - Manages conversation state
 * - Coordinates API calls with storage
 * - Provides clean interface to app.js
 * - No UI dependencies
 */

import { Storage } from '../storage.js';
import { ApiClient } from './apiClient.js';
import { ApiConfig } from './apiConfig.js';

/**
 * Generate system prompt based on persona
 */
async function getSystemPrompt(conversation) {
  if (!conversation?.systemPromptId) {
    return 'You are Privex AI, a helpful and thoughtful assistant.';
  }
  
  const personas = await Storage.getPersonas();
  const persona = personas.find((p) => p.id === conversation.systemPromptId);
  return persona?.systemPrompt || 'You are Privex AI, a helpful assistant.';
}

/**
 * Create new conversation
 */
export async function createConversation(title = '', model = '') {
  if (!model) {
    model = localStorage.getItem('privexai_model') || 'gpt-4o-mini';
  }
  
  const conversation = await Storage.createConversation({
    title: title || 'New Conversation',
    model
  });
  
  return conversation;
}

/**
 * Send message and get response
 */
export async function sendMessage(conversationId, userMessage, onChunk, onDone, onError) {
  // Validate
  if (!userMessage?.trim() || !conversationId) {
    if (onError) onError(400, 'Invalid message or conversation');
    return null;
  }
  
  // Check API key
  if (!ApiConfig.isApiKeyAvailable()) {
    if (onError) onError(401, 'API key not configured. Please set up your API key first.');
    return null;
  }
  
  try {
    // Get conversation and messages
    const conversation = await Storage.getConversation(conversationId);
    if (!conversation) {
      if (onError) onError(404, 'Conversation not found');
      return null;
    }
    
    const messageHistory = await Storage.getMessages(conversationId);
    
    // Add user message
    const userMsg = await Storage.addMessage(conversationId, {
      role: 'user',
      content: userMessage.trim()
    });
    
    // Build API request
    const systemPrompt = await getSystemPrompt(conversation);
    const messagesForAPI = messageHistory.map((m) => ({
      role: m.role,
      content: m.content
    }));
    
    // Add current user message to history for API
    messagesForAPI.push({
      role: 'user',
      content: userMessage.trim()
    });
    
    // Stream response
    let assistantContent = '';
    
    await new Promise((resolve, reject) => {
      ApiClient.streamRequest(
        messagesForAPI,
        systemPrompt,
        { model: conversation.model },
        // onChunk
        (chunk) => {
          assistantContent += chunk;
          if (onChunk) onChunk(chunk);
        },
        // onDone
        async (fullText) => {
          try {
            // Only save if we got content
            if (fullText?.trim()) {
              const assistantMsg = await Storage.addMessage(conversationId, {
                role: 'assistant',
                content: fullText
              });
              if (onDone) onDone(assistantMsg);
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        // onError
        (status, errorMsg) => {
          if (onError) onError(status, errorMsg);
          reject(new Error(errorMsg));
        }
      );
    });
    
    return {
      userMessage: userMsg,
      assistantContent
    };
  } catch (error) {
    if (onError) onError(500, error.message);
    return null;
  }
}

/**
 * Load conversation with messages
 */
export async function loadConversation(conversationId) {
  try {
    const conversation = await Storage.getConversation(conversationId);
    if (!conversation) return null;
    
    const messages = await Storage.getMessages(conversationId);
    return {
      ...conversation,
      messages
    };
  } catch (error) {
    console.error('Failed to load conversation:', error);
    return null;
  }
}

/**
 * Get all conversations
 */
export async function getAllConversations() {
  try {
    return await Storage.getAllConversations();
  } catch (error) {
    console.error('Failed to get conversations:', error);
    return [];
  }
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(conversationId, title) {
  try {
    await Storage.updateConversation(conversationId, {
      title: title?.trim() || 'New Conversation',
      updatedAt: Date.now()
    });
    return true;
  } catch (error) {
    console.error('Failed to update conversation:', error);
    return false;
  }
}

/**
 * Delete conversation
 */
export async function deleteConversation(conversationId) {
  try {
    await Storage.deleteConversation(conversationId);
    return true;
  } catch (error) {
    console.error('Failed to delete conversation:', error);
    return false;
  }
}

/**
 * Pin/unpin conversation
 */
export async function togglePin(conversationId, isPinned) {
  try {
    await Storage.pinConversation(conversationId, isPinned);
    return true;
  } catch (error) {
    console.error('Failed to pin conversation:', error);
    return false;
  }
}

/**
 * Star/unstar message
 */
export async function toggleStarMessage(messageId, isStarred) {
  try {
    await Storage.updateMessage(messageId, {
      isStarred: !!isStarred
    });
    return true;
  } catch (error) {
    console.error('Failed to star message:', error);
    return false;
  }
}

/**
 * Get starred messages
 */
export async function getStarredMessages() {
  try {
    return await Storage.getStarredMessages();
  } catch (error) {
    console.error('Failed to get starred messages:', error);
    return [];
  }
}

/**
 * Delete message
 */
export async function deleteMessage(messageId) {
  try {
    await Storage.deleteMessage(messageId);
    return true;
  } catch (error) {
    console.error('Failed to delete message:', error);
    return false;
  }
}

/**
 * Stop streaming
 */
export function stopStreaming() {
  ApiClient.stopStreaming();
}

/**
 * Test API connection
 */
export async function testApiConnection(apiKey, model) {
  return ApiClient.testConnection(apiKey, model);
}

/**
 * Chat Engine namespace
 */
export const ChatEngine = {
  createConversation,
  sendMessage,
  loadConversation,
  getAllConversations,
  updateConversationTitle,
  deleteConversation,
  togglePin,
  toggleStarMessage,
  getStarredMessages,
  deleteMessage,
  stopStreaming,
  testApiConnection
};

export default ChatEngine;
