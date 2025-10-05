import React, { useState } from 'react';

const ChatInput = ({ onSend, loading }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !loading) {
      onSend(message.trim());
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask about your design..."
        disabled={loading}
        style={{
          flex: 1,
          padding: '12px 16px',
          background: 'rgba(51, 65, 85, 0.4)',
          border: '1px solid rgba(71, 85, 105, 0.3)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '14px',
          outline: 'none',
          opacity: loading ? 0.6 : 1
        }}
      />
      <button
        type="submit"
        disabled={loading || !message.trim()}
        style={{
          padding: '12px 16px',
          background: loading || !message.trim() 
            ? 'rgba(51, 65, 85, 0.3)' 
            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          border: 'none',
          borderRadius: '8px',
          color: 'white',
          fontSize: '14px',
          fontWeight: '600',
          cursor: loading || !message.trim() ? 'not-allowed' : 'pointer',
          opacity: loading || !message.trim() ? 0.6 : 1
        }}
      >
        {loading ? '...' : '→'}
      </button>
    </form>
  );
};

const SimpleAIExplain = ({ cityState, impactAnalysis, onClose, visible }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const GPT_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
  const GPT_API_URL = 'https://api.openai.com/v1/chat/completions';

  const analyzeCurrentState = () => {
    const items = Object.values(cityState);
    
    const state = {
      totalItems: items.length,
      itemTypes: {},
      itemsList: items.map((item, idx) => ({ 
        id: idx + 1, 
        type: item.type, 
        name: item.name 
      })),
      impactAnalysis: impactAnalysis,
      timestamp: new Date().toISOString()
    };
  
    items.forEach(item => {
      state.itemTypes[item.type] = (state.itemTypes[item.type] || 0) + 1;
    });
  
    return state;
  };

  const getAIExplanation = async (userMessage = null) => {
    setLoading(true);
    setError(null);
    
    try {
      const currentState = analyzeCurrentState();
      
      if (userMessage) {
        setMessages(prev => [...prev, { type: 'user', content: userMessage, timestamp: new Date() }]);
      }
      
      const conversationHistory = messages.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));
      
      const systemPrompt = `You are an urban planning AI assistant analyzing Chicago environmental interventions.

CRITICAL RULES:
- Use ONLY the exact numbers provided - never estimate or guess
- If you see "Score change: +3.4 points", you MUST say "+3.4 points" not "7.2" or any other number
- Use exact region names provided (e.g., "Region r4")
- Mention NASA data types (LST for temperature, NDVI for vegetation, NO₂ for air quality) conceptually only
- Keep responses under 100 words

FORMAT:
[Exact score change] → [Scientific explanation] → [Resident benefit]`;
  
      let contextPrompt = '';
      
      if (userMessage) {
        contextPrompt = `User question: "${userMessage}"\n\n`;
      }
      
      contextPrompt += `CURRENT STATE:\n`;
      contextPrompt += `- Total interventions placed: ${currentState.totalItems}\n`;

      if (currentState.totalItems > 0) {
        contextPrompt += `- Summary: ${JSON.stringify(currentState.itemTypes)}\n`;
        contextPrompt += `- All interventions: ${currentState.itemsList.map(i => `#${i.id} ${i.name}`).join(', ')}\n`;
      }
      
      if (currentState.impactAnalysis) {
        contextPrompt += `\nMOST RECENT IMPACT:\n`;
        contextPrompt += `- Intervention: ${currentState.impactAnalysis.interventionType}\n`;
        contextPrompt += `- Region: ${currentState.impactAnalysis.title}\n`;
        contextPrompt += `- Old score: ${currentState.impactAnalysis.oldScore}\n`;
        contextPrompt += `- New score: ${currentState.impactAnalysis.newScore}\n`;
        contextPrompt += `- Score change: +${currentState.impactAnalysis.scoreChange} points (EXACT NUMBER - use this)\n`;
      }
      
      if (currentState.totalItems === 0) {
        contextPrompt += `\nUSER JUST OPENED APP:
- Map shows Chicago regions colored by environmental health (green=good 70-100, yellow=moderate 40-69, red=poor <40)
- Health scores from NASA satellite data (LST, NDVI, NO₂)
- Metrics: Health Score, AQI, Temperature, Humidity
- Invite user to click regions or add interventions (parks, reflective surfaces, water bodies)`;
      } else {
        contextPrompt += `\nEXPLAIN: How these interventions scientifically improve environment. Use ONLY the exact numbers above.`;
      }
  
      const response = await fetch(GPT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GPT_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: contextPrompt }
          ],
          max_tokens: 200,
          temperature: 0.3,
        })
      });
  
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
  
      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      
      setMessages(prev => [...prev, { type: 'ai', content: aiResponse, timestamp: new Date() }]);
  
    } catch (err) {
      console.error('Error getting AI explanation:', err);
      setError('Failed to get AI response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (visible && messages.length === 0) {
      getAIExplanation();
    }
  }, [visible]);

  const handleSendMessage = (message) => {
    if (message.trim()) {
      getAIExplanation(message);
    }
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '380px',
      height: '500px',
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(10px)',
      borderRadius: '16px',
      border: '1px solid #3b82f6',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      color: 'white'
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(71, 85, 105, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', color: '#60a5fa', fontSize: '16px', fontWeight: '700' }}>
            Urban AI Assistant
          </h3>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
            Powered by GPT-4o & NASA data
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ×
        </button>
      </div>

      <div style={{
        flex: 1,
        padding: '16px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.length === 0 && !loading && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '14px',
            color: '#94a3b8',
            textAlign: 'center'
          }}>
            Ask me anything about your urban design!
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} style={{
            display: 'flex',
            justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
          }}>
            <div style={{
              background: message.type === 'user' 
                ? 'rgba(59, 130, 246, 0.2)' 
                : 'rgba(51, 65, 85, 0.4)',
              border: `1px solid ${message.type === 'user' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(71, 85, 105, 0.3)'}`,
              borderRadius: '12px',
              padding: '12px 16px',
              maxWidth: '80%',
              fontSize: '14px',
              lineHeight: '1.4'
            }}>
              {message.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start'
          }}>
            <div style={{
              background: 'rgba(51, 65, 85, 0.4)',
              border: '1px solid rgba(71, 85, 105, 0.3)',
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px'
            }}>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(59, 130, 246, 0.3)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Analyzing...
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '14px',
            color: '#fca5a5'
          }}>
            {error}
          </div>
        )}
      </div>

      <div style={{
        padding: '16px',
        borderTop: '1px solid rgba(71, 85, 105, 0.3)'
      }}>
        <ChatInput onSend={handleSendMessage} loading={loading} />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SimpleAIExplain;