import { Controller, Get, HttpStatus, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { FeedService } from './feed.service';
import { JwtGuard } from 'src/auth/guard';
import { PostService } from 'src//modules/post/post.service';
import { GetFeedResponseDtoExample, GetTopFeedResponseDtoExample } from './dto';
import { GetPostsByHashtagsResponseDtoExample, PostDto } from 'src/modules/post/dto';
import { PageOptionsDto } from 'src/common/dto/pagination';

@Controller('feed')
@ApiTags('Feed')
export class FeedController {
  constructor(
    private readonly feedService: FeedService,
    private readonly postService: PostService,
  ) {}

  @Get('/')
  @UseGuards(JwtGuard)
  @ApiSecurity('JWT-auth')
  @ApiOperation({ summary: 'Gets the feed of the logged in user' })
  @ApiOkResponse({
    description: 'feed retrieved successfully',
    type: GetFeedResponseDtoExample,
  })
  @ApiNotFoundResponse({ description: 'user not found' })
  @ApiUnauthorizedResponse({ description: 'unauthorized' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async feed(@Query() pageOptionsDto: PageOptionsDto, @Req() req) {
    const userId = req.user.userID;
    const posts = await this.feedService.feed(userId, pageOptionsDto);
    return { statusCode: HttpStatus.OK, message: 'feed retrieved successfully', data: { ...posts } };
  }

  @Get('/top')
  @ApiOperation({ summary: 'Gets top 30 posts on the platform based on interactions' })
  @ApiOkResponse({ description: 'feed retrieved successfully', type: GetTopFeedResponseDtoExample })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async top() {
    const posts: PostDto[] = await this.feedService.topFeed();
    return { statusCode: HttpStatus.OK, message: 'feed retrieved successfully', data: { posts } };
  }

  @Get('/hashtags')
  @ApiOperation({ summary: 'Gets posts related to hashtags' })
  @ApiOkResponse({
    description: 'feed retrieved successfully',
    type: GetPostsByHashtagsResponseDtoExample,
  })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  @ApiQuery({ name: 'hashtags', example: '?hashtags=webdev&hashtags=programming&hashtags=life' })
  async postsByHashtags(
    @Query() pageOptionsDto: PageOptionsDto,
    @Query() hashtags: { hashtags: string[] },
  ) {
    let posts: PostDto;
    if (Array.isArray(hashtags.hashtags)) {
      posts = await this.postService.getPostsByHashtags(hashtags.hashtags, pageOptionsDto);
    } else {
      const hashes = Array(hashtags.hashtags);
      posts = await this.postService.getPostsByHashtags(hashes, pageOptionsDto);
    }
    return { statusCode: HttpStatus.OK, message: 'feed retrieved successfully', data: { ...posts } };
  }
}
