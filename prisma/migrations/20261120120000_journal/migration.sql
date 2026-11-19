-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JournalLinkKind" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateTable
CREATE TABLE "JournalAuthor" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" TEXT NOT NULL,
    "role" VARCHAR(80),
    "bio" VARCHAR(600),
    "avatarUrl" TEXT,
    "socialLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalCategory" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" TEXT NOT NULL,
    "description" VARCHAR(500),
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(170),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTag" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalPost" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "excerpt" VARCHAR(300),
    "content" JSONB NOT NULL,
    "headings" JSONB NOT NULL DEFAULT '[]',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "readingMinutes" INTEGER NOT NULL DEFAULT 1,
    "coverImageUrl" TEXT,
    "coverAlt" VARCHAR(200),
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(170),
    "focusKeyword" VARCHAR(80),
    "canonicalUrl" TEXT,
    "ogImageUrl" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "authorId" UUID,
    "categoryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalPostTag" (
    "postId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "JournalPostTag_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "JournalPostProduct" (
    "postId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalPostProduct_pkey" PRIMARY KEY ("postId","productId")
);

-- CreateTable
CREATE TABLE "JournalLink" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "kind" "JournalLinkKind" NOT NULL,
    "targetType" VARCHAR(20) NOT NULL,
    "targetId" UUID,
    "targetPostId" UUID,
    "href" TEXT NOT NULL,
    "anchorText" VARCHAR(300) NOT NULL,
    "rel" VARCHAR(60),
    "newTab" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JournalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalSlugRedirect" (
    "oldSlug" TEXT NOT NULL,
    "postId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalSlugRedirect_pkey" PRIMARY KEY ("oldSlug")
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalAuthor_slug_key" ON "JournalAuthor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "JournalCategory_slug_key" ON "JournalCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTag_slug_key" ON "JournalTag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "JournalPost_slug_key" ON "JournalPost"("slug");

-- CreateIndex
CREATE INDEX "JournalPost_status_publishedAt_idx" ON "JournalPost"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "JournalPost_categoryId_idx" ON "JournalPost"("categoryId");

-- CreateIndex
CREATE INDEX "JournalPost_authorId_idx" ON "JournalPost"("authorId");

-- CreateIndex
CREATE INDEX "JournalPostTag_tagId_idx" ON "JournalPostTag"("tagId");

-- CreateIndex
CREATE INDEX "JournalPostProduct_productId_idx" ON "JournalPostProduct"("productId");

-- CreateIndex
CREATE INDEX "JournalLink_postId_idx" ON "JournalLink"("postId");

-- CreateIndex
CREATE INDEX "JournalLink_targetPostId_idx" ON "JournalLink"("targetPostId");

-- CreateIndex
CREATE INDEX "JournalLink_targetType_targetId_idx" ON "JournalLink"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "JournalSlugRedirect_postId_idx" ON "JournalSlugRedirect"("postId");

-- AddForeignKey
ALTER TABLE "JournalPost" ADD CONSTRAINT "JournalPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "JournalAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPost" ADD CONSTRAINT "JournalPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "JournalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPostTag" ADD CONSTRAINT "JournalPostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "JournalPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPostTag" ADD CONSTRAINT "JournalPostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "JournalTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPostProduct" ADD CONSTRAINT "JournalPostProduct_postId_fkey" FOREIGN KEY ("postId") REFERENCES "JournalPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalPostProduct" ADD CONSTRAINT "JournalPostProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLink" ADD CONSTRAINT "JournalLink_postId_fkey" FOREIGN KEY ("postId") REFERENCES "JournalPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLink" ADD CONSTRAINT "JournalLink_targetPostId_fkey" FOREIGN KEY ("targetPostId") REFERENCES "JournalPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalSlugRedirect" ADD CONSTRAINT "JournalSlugRedirect_postId_fkey" FOREIGN KEY ("postId") REFERENCES "JournalPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

