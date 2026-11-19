import { Module } from '@nestjs/common';
import { AdminJournalController, PublicJournalController } from './journal.controller.js';
import { JournalService } from './journal.service.js';

/** The Shreeni Journal (blog): posts, categories, authors, tags, link index and slug redirects. */
@Module({
  controllers: [AdminJournalController, PublicJournalController],
  providers: [JournalService],
})
export class JournalModule {}
