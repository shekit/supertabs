import Anthropic from '@anthropic-ai/sdk';
import { RedditPost } from './reddit-service';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PATHS, RESOURCES, MODELS } from './constants/constants';

dotenv.config({ path: path.join(__dirname, '..', PATHS.ENV) });

export interface PostRelevance {
    postId: string;
    isRelevant: boolean;
    relevanceScore: number;
    reasoning: string;
}

export class LLMService {
    private anthropic: Anthropic;
    private systemPrompt: string;
    private analyzePostsTool: any;
    
    constructor() {
        const apiKey = process.env.CLAUDE_API_KEY;
  
        if (!apiKey) {
            throw new Error('CLAUDE_API_KEY not found in environment variables');
        }
        
        this.anthropic = new Anthropic({
            apiKey: apiKey
        });
        
        // Load system prompt from file
        const promptPath = path.join(__dirname, '..', PATHS.PROMPTS, RESOURCES.PROMPTS.FILTER);
        this.systemPrompt = fs.readFileSync(promptPath, 'utf-8');

        // Load tool definition from file
        const toolPath = path.join(__dirname, '..', PATHS.TOOLS, RESOURCES.TOOLS.ANALYZE_POSTS);
        this.analyzePostsTool = JSON.parse(fs.readFileSync(toolPath, 'utf-8'));
    }
    
    async filterPosts(posts: RedditPost[], businessPrompt: string): Promise<RedditPost[]> {
        if (!businessPrompt || posts.length === 0) {
            return posts;
        }
        
        try {
            // Prepare posts data for analysis
            const postsData = posts.map(post => ({
                id: post.id,
                title: post.title,
                subreddit: post.subreddit,
                content: post.selftext ? post.selftext.substring(0, 500) : 'No text content',
                num_comments: post.num_comments
            }));
            
            const response = await this.anthropic.messages.create({
                model: MODELS.CLAUDE,
                max_tokens: 8192,
                temperature: 0,
                system: this.systemPrompt,
                messages: [{
                    role: 'user',
                    content: `Business/Expertise Context: ${businessPrompt}

                    Analyze these Reddit posts and determine which ones are relevant for someone with the above expertise to comment on.
                    
                    <reddit_posts>
                    ${JSON.stringify(postsData, null, 2)}
                    </reddit_posts>`
                }],
                tools: [this.analyzePostsTool],
                tool_choice: { type: 'tool', name: 'analyze_posts' }
            });

            console.log('LLM Response:', JSON.stringify(response, null, 2));
            
            // Extract the tool use response
            const toolUse = response.content.find(block => block.type === 'tool_use');
            if (toolUse && toolUse.type === 'tool_use') {
                const analysisResult = toolUse.input as { posts: PostRelevance[] };

                console.log('Tool Use Input:', JSON.stringify(analysisResult, null, 2));
            
                // Log each post's analysis
                analysisResult.posts.forEach(pr => {
                    console.log(`Post ${pr.postId}: Relevant=${pr.isRelevant}, Score=${pr.relevanceScore}, Reason="${pr.reasoning}"`);
                });
                
                // Create a map for quick lookup
                const relevanceMap = new Map<string, PostRelevance>();
                analysisResult.posts.forEach(pr => relevanceMap.set(pr.postId, pr));
                
                // Filter and sort posts
                const relevantPosts = posts
                    .filter(post => {
                        const relevance = relevanceMap.get(post.id);
                        return relevance?.isRelevant === true;
                    })
                    .sort((a, b) => {
                        const scoreA = relevanceMap.get(a.id)?.relevanceScore || 0;
                        const scoreB = relevanceMap.get(b.id)?.relevanceScore || 0;
                        return scoreB - scoreA;
                    });
                
                console.log(`Filtered ${posts.length} posts down to ${relevantPosts.length} relevant ones`);
                return relevantPosts;
            }
            
            // Fallback if tool use fails
            console.error('No tool use response found');
            return posts;
            
        } catch (error) {
            console.error('LLM filtering failed:', error);
            return posts;
        }
    }
}