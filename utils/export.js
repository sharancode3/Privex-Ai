/**
 * Export Utilities
 * 
 * Client-side only export functionality for chat data.
 * - PDF export with WhatsApp-style formatting
 * - No server calls, pure client-side file generation
 */

/**
 * Export chat as PDF (WhatsApp style)
 */
export function exportChatAsPDF(conversationTitle, messages) {
  if (!messages || !Array.isArray(messages)) {
    console.error('No messages provided');
    return;
  }

  const chatHTML = messages.map(msg => {
    const isUser = msg.role === 'user';
    const name = isUser ? 'You' : 'Privex AI';
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const align = isUser ? 'flex-end' : 'flex-start';
    const bg = isUser ? '#1a1a1a' : '#111111';
    const radius = isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px';
    return `<div style="display:flex;flex-direction:column;align-items:${align};margin-bottom:12px;">
      <div style="font-size:11px;color:#888;margin-bottom:3px;padding:0 4px;">${name}</div>
      <div style="background:${bg};color:#f5f5f5;padding:10px 14px;border-radius:${radius};max-width:72%;font-size:14px;line-height:1.6;word-wrap:break-word;">${escapeHtml(msg.content || '')}</div>
      <div style="font-size:10px;color:#555;margin-top:3px;padding:0 4px;">${time}</div>
    </div>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(conversationTitle)}</title>
  <style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:24px;max-width:700px;margin:0 auto;}
  h2{font-size:16px;font-weight:500;color:#f5f5f5;margin-bottom:4px;}.meta{font-size:12px;color:#555;margin-bottom:24px;}
  hr{border:none;border-top:1px solid #1f1f1f;margin:16px 0;}@media print{body{background:white;color:black;}.meta{color:#666;}hr{border-top-color:#ddd;}}</style>
  </head><body><h2>${escapeHtml(conversationTitle)}</h2>
  <div class="meta">Exported from Privex AI · ${new Date().toLocaleDateString()}</div>
  <hr>${chatHTML}
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
  </body></html>`);
  win.document.close();
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Export utilities for backwards compatibility
 */
export const ExportUtils = {
  exportChatAsPDF
};

export default ExportUtils;

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
