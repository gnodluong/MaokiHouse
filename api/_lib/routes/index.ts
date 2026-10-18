import { Router } from 'express';
import homestaysRouter from './homestays';
import contentRouter from './content';
import uploadRouter from './upload';
import authRouter from './auth';
import propertiesRouter from './properties';
import bookingsRouter from './bookings';
import messagesRouter from './messages';
import employeesRouter from './employees';
import revenueRouter from './revenue';
import channelsRouter from './channels';
import aiRouter from './ai';
import workspaceRouter from '../workspace/router';
import publicRouter from '../workspace/public';

const router = Router();

router.use('/homestays', homestaysRouter);
router.use('/content', contentRouter);
router.use('/upload', uploadRouter);
router.use('/auth', authRouter);
router.use('/properties', propertiesRouter);
router.use('/bookings', bookingsRouter);
router.use('/messages', messagesRouter);
router.use('/employees', employeesRouter);
router.use('/revenue', revenueRouter);
router.use('/channels', channelsRouter);
router.use('/ai', aiRouter);
router.use('/workspace', workspaceRouter);
router.use('/public', publicRouter);

export default router;
