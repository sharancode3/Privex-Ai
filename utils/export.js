/**
 * Export Utilities
 * 
 * Client-side only export functionality for chat data.
 * - No server calls, pure client-side file generation
 * - JSON: Full conversation data
 * - TXT: Human-readable text format
 * - CSV: Spreadsheet-compatible format
 */

/**
 * Trigger browser file download
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export entire conversation as JSON
 */
export function exportConversationAsJSON(conversation) {
  if (!conversation) {
    console.error('No conversation data provided');
    return;
  }
  
  const data = {
    metadata: {
      exportedAt: new Date().toISOString(),
      title: conversation.title || 'Conversation',
      conversationId: conversation.id,
      messageCount: (conversation.messages || []).length
    },
    conversation: {
      ...conversation,
      messages: (conversation.messages || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        isStarred: msg.isStarred,
        isPinned: msg.isPinned
      }))
    }
  };
  
  const json = JSON.stringify(data, null, 2);
  const filename = `${sanitizeFilename(conversation.title || 'conversation')}_${Date.now()}.json`;
  downloadFile(json, filename, 'application/json');
}

/**
 * Export multiple conversations as JSON
 */
export function exportAllConversationsAsJSON(conversations) {
  if (!Array.isArray(conversations) || !conversations.length) {
    console.error('No conversations to export');
    return;
  }
  
  const data = {
    metadata: {
      exportedAt: new Date().toISOString(),
      totalConversations: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0)
    },
    conversations: conversations.map((conv) => ({
      ...conv,
      messages: (conv.messages || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        isStarred: msg.isStarred,
        isPinned: msg.isPinned
      }))
    }))
  };
  
  const json = JSON.stringify(data, null, 2);
  const filename = `privex-ai-export_${Date.now()}.json`;
  downloadFile(json, filename, 'application/json');
}

/**
 * Export conversation as plaintext
 */
export function exportConversationAsText(conversation) {
  if (!conversation) {
    console.error('No conversation data provided');
    return;
  }
  
  const messages = conversation.messages || [];
  const lines = [];
  
  lines.push(`# ${conversation.title || 'Conversation'}`);
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push(`Total Messages: ${messages.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  for (const msg of messages) {
    const role = msg.role === 'assistant' || msg.role === 'model' ? 'Assistant' : 'You';
    const timestamp = new Date(msg.timestamp || 0).toLocaleString();
    
    lines.push(`[${timestamp}] ${role}:`);
    lines.push(msg.content || '(no content)');
    lines.push('');
  }
  
  const text = lines.join('\n');
  const filename = `${sanitizeFilename(conversation.title || 'conversation')}_${Date.now()}.txt`;
  downloadFile(text, filename, 'text/plain');
}

/**
 * Export all conversations as plaintext (concatenated)
 */
export function exportAllConversationsAsText(conversations) {
  if (!Array.isArray(conversations) || !conversations.length) {
    console.error('No conversations to export');
    return;
  }
  
  const lines = [];
  lines.push('# Privex AI - Chat History Export');
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push(`Total Conversations: ${conversations.length}`);
  lines.push(`Total Messages: ${conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0)}`);
  lines.push('');
  lines.push('='.repeat(80));
  lines.push('');
  
  for (const conversation of conversations) {
    lines.push(`# ${conversation.title || 'Untitled Conversation'}`);
    lines.push(`Created: ${new Date(conversation.createdAt || 0).toLocaleString()}`);
    lines.push(`Messages: ${(conversation.messages || []).length}`);
    lines.push('');
    lines.push('-'.repeat(80));
    
    for (const msg of conversation.messages || []) {
      const role = msg.role === 'assistant' || msg.role === 'model' ? 'Assistant' : 'You';
      const timestamp = new Date(msg.timestamp || 0).toLocaleString();
      
      lines.push(`[${timestamp}] ${role}:`);
      lines.push(msg.content || '(no content)');
      lines.push('');
    }
    
    lines.push('');
    lines.push('='.repeat(80));
    lines.push('');
  }
  
  const text = lines.join('\n');
  const filename = `privex-ai-export_${Date.now()}.txt`;
  downloadFile(text, filename, 'text/plain');
}

/**
 * Export conversation as CSV
 */
export function exportConversationAsCSV(conversation) {
  if (!conversation) {
    console.error('No conversation data provided');
    return;
  }
  
  const messages = conversation.messages || [];
  const lines = [];
  
  // Header
  lines.push('"Timestamp","Role","Content","Starred","Pinned"');
  
  // Data rows
  for (const msg of messages) {
    const timestamp = new Date(msg.timestamp || 0).toLocaleString();
    const role = msg.role === 'assistant' || msg.role === 'model' ? 'Assistant' : 'User';
    const content = (msg.content || '').replace(/"/g, '""'); // Escape quotes
    const starred = msg.isStarred ? 'Yes' : 'No';
    const pinned = msg.isPinned ? 'Yes' : 'No';
    
    lines.push(`"${timestamp}","${role}","${content}","${starred}","${pinned}"`);
  }
  
  const csv = lines.join('\n');
  const filename = `${sanitizeFilename(conversation.title || 'conversation')}_${Date.now()}.csv`;
  downloadFile(csv, filename, 'text/csv');
}

/**
 * Sanitize filename to remove special characters
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
}

/**
 * Export utilities namespace
 */
export const ExportUtils = {
  exportConversationAsJSON,
  exportAllConversationsAsJSON,
  exportConversationAsText,
  exportAllConversationsAsText,
  exportConversationAsCSV
};

export default ExportUtils;
