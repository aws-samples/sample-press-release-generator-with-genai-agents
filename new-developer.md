# 🚀 100Market Press Release Generator - New Developer Onboarding Guide

Welcome to the **100Market Press Release Generator GenAI Agents** project! This is a **Proof of Concept (POC)** multi-agent system designed for experimentation and development of AI-powered press release generation for real estate markets.

## 📊 POC Status & Experimental Results

- **POC Status**: Experimental system for research and development
- **Test Results**: 99.1% accuracy achieved in POC testing scenarios
- **37+ AI Agents**: Experimental multi-agent coordination architecture
- **Dual-AI Architecture**: AWS Bedrock Claude + Perplexity AI integration (POC implementation)
- **Performance Metrics**: 474 files generated vs 328 claimed in POC tests (+45% improvement)
- **Experimental Scale**: Redis Queue Manager + 4 Worker Pools for 100-market processing (POC configuration)

**⚠️ IMPORTANT DISCLAIMER**: This is a proof of concept system designed for experimentation, research, and development purposes. It is not production-ready and should not be used in enterprise environments without significant additional development, testing, and validation.

## 🏗️ Architecture Overview

```mermaid
graph TB
    subgraph "Frontend Layer"
        UI[Web UI - Port 3000]
        Dashboard[Lineage Dashboard]
    end
    
    subgraph "API Layer"
        API[Express API - Port 3001]
        Controller[Content Generation Controller]
    end
    
    subgraph "Multi-Agent System"
        Orchestrator[GenAI Orchestrator]
        MR[Market Researcher]
        CA[Content Analyzer]
        LE[Localization Engine]
        QV[Quality Validator]
        OF[Output Formatter]
        FC[Fact Checker]
    end
    
    subgraph "AI Services"
        Bedrock[AWS Bedrock Claude]
        Tavily[Tavily AI]
    end
    
    subgraph "Data Sources"
        TrustedData[Supplied Data]
        Tavily [Crawling / AI search Service]
    end
    
    UI --> API
    API --> Controller
    Controller --> Orchestrator
    Orchestrator --> MR
    Orchestrator --> CA
    Orchestrator --> LE
    Orchestrator --> QV
    Orchestrator --> OF
    Orchestrator --> FC
    
    CA --> Bedrock
    FC --> Bedrock
    
    MR --> Firecrawl
```

## 🛠️ POC Technology Stack

### Core Technologies (POC Implementation)
- **Backend**: Node.js + Express.js (Port 3001)
- **Frontend**: Vanilla HTML/CSS/JavaScript with Node.js server (Port 3000)
- **AI Models** (Experimental):
  - AWS Bedrock Claude Sonnet 4
  - Perplexity AI (llama-3.1-sonar-small-128k-online)
- **Storage** (POC Configuration): DynamoDB, Redis, S3, Local filesystem
- **Testing**: Jest with experimental test suites

## 📁 Project Structure

```
├── backend/                 # Node.js backend services
│   ├── src/
│   │   ├── controllers/     # API controllers
│   │   ├── services/        # Business logic services
│   │   │   ├── agents/      # 37+ specialized AI agents
│   │   │   ├── dataservice/      # Real estate data services
│   │   │   └── queue/       # Job queue management
│   │   ├── routes/          # API routes
│   │   └── config/          # Configuration management
│   ├── storage/             # Generated content storage
│   └── tests/               # Test suites
├── frontend/                # Web interface
├── docs/                    # Documentation
├── logs/                    # Application logs
├── tests/                   # Additional test files
├── temp/                    # Temporary files and scripts
└── memory-bank/             # Project context and lessons learned
```

## 🚀 Quick Start Guide

### 1. Environment Setup
Ensure you have the required environment variables in `.env`:

```bash
# AI Services
AWS_BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0
PERPLEXITY_API_KEY=your_perplexity_key

# Web Scraping
FIRECRAWL_API_KEY=your_firecrawl_key

# Server Configuration
PORT=3001
FRONTEND_PORT=3000
```

### 2. Installation & Startup

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Start backend (port 3001)
cd backend && npm run dev

# Start frontend (port 3000) - in new terminal
cd frontend && npm start
```

### 3. Verify System Health

```bash
# Check backend status
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/status
```

## 🧪 Testing the System

### Basic API Test
```bash
curl -X POST http://localhost:3001/api/v1/content/generate \
  -H "Content-Type: application/json" \
  -d '{
    "markets": ["Los Angeles-Long Beach-Anaheim"],
    "masterPR": "[FULL CONTENT FROM pr-master2 FILE]",
    "dataSource": "trusted",
    "options": {
      "formats": ["standard"],
      "validationMode": "standard"
    }
  }'
```

## 🔧 Key Development Patterns

### 1. Multi-Agent Architecture
- All agents extend from `BaseAgent` class
- Use dependency injection for services
- Implement circuit breaker patterns for external calls
- Structured logging with agent context

### 2. Error Handling
- Comprehensive retry logic with exponential backoff
- Circuit breakers for fault tolerance
- Graceful degradation when services unavailable
- Detailed error logging and recovery

### 3. Testing Strategy
- Unit tests for individual agents
- Integration tests for service interactions
- End-to-end tests with real data
- Mock services for external dependencies

## 📊 POC Performance Metrics

**Note: These are experimental results from POC testing and do not represent production performance guarantees.**

- **Processing Speed**: 48-182 seconds per market (POC test results)
- **File Generation**: 474 files vs 328 claimed (+45% improvement in POC tests)
- **Success Rate**: 100% across POC test scenarios (limited scope)
- **Concurrent Processing**: Redis Queue Manager + 4 Worker Pools (experimental configuration)

## 🔍 Key Files to Understand

### Core Services
- `backend/src/services/genaiOrchestrator.js` - Main orchestration logic
- `backend/src/services/agents/baseAgent.js` - Base class for all agents
- `backend/src/controllers/contentGeneration.js` - API controller

### Configuration
- `.env` - Environment variables
- `backend/src/config/index.js` - Centralized configuration

### Frontend
- `frontend/js/app.js` - Main frontend application
- `frontend/js/lineage-dashboard.js` - Data lineage visualization

## 🚨 Critical Development Guidelines

1. **Always use `lsof -i :PORT`** to verify services are running
2. **Test against live API endpoints** rather than standalone scripts
3. **Use `rg` (ripgrep)** for codebase searches and understanding
4. **End-to-end testing is mandatory** before marking tasks complete
5. **Check Memory Bank lessons-learned.md** to avoid repeating past mistakes

## 🎯 Next Steps for New Developers

1. **Understand the Multi-Agent System**: Start with `genaiOrchestrator.js` (POC implementation)
2. **Run Test Suites**: Validate your understanding with existing experimental tests
3. **Study the Fact-Checking System**: Experimental feature achieving 99.1% accuracy in POC tests

**Development Focus**: This POC system is designed for learning, experimentation, and proof-of-concept validation. Focus on understanding the architecture and contributing to the experimental development rather than production deployment.

**Welcome to the team! This POC system demonstrates the potential of AI-powered content generation with fact-checking capabilities and serves as a foundation for future development and research.**

## 🔬 POC Limitations & Future Development

**Current POC Limitations:**
- Experimental architecture requiring production hardening
- Limited scalability testing beyond POC scenarios
- Requires comprehensive security review for production use
- Performance metrics based on controlled POC testing environment
- Error handling and edge cases need production-level validation

**Future Development Roadmap:**
- Production architecture design and implementation
- Comprehensive security and compliance review
- Scalability testing and optimization
- Enterprise-grade monitoring and observability
- Production deployment and operational procedures

**Research & Development Focus:**
- Multi-agent system optimization
- Fact-checking accuracy improvements
- Real-time data integration enhancements
- Performance and cost optimization
- User experience and interface development