import { getAppName, sendEmail } from '@/platform/server/emails/email-service';
import { CONTACT_EMAIL } from '@/ui/marketing/constants';
/**
 * "Your video is ready" — server-only, rendered by email-service.
 */

import {
  Button,
  Heading,
  Img,
  Link,
  Section,
  Text,
} from '@react-email/components';
import {
  buttonStyle,
  EmailLayout,
  headingStyle,
  paragraphStyle,
} from '@/platform/server/emails/email-layout';

export interface SequenceReadyEmailProps {
  appName: string;
  title: string;
  watchUrl: string;
  creditsUrl: string;
  posterUrl?: string;
  clipMeta?: string;
  balanceDisplay: string;
  typicalShortCostDisplay: string;
}

const posterStyle: React.CSSProperties = {
  marginBottom: 24,
  borderRadius: 8,
};

const creditsLinkStyle: React.CSSProperties = {
  color: '#fafafa',
  textDecoration: 'underline',
};

export const SequenceReadyEmail: React.FC<SequenceReadyEmailProps> = ({
  appName,
  title,
  watchUrl,
  creditsUrl,
  posterUrl,
  clipMeta,
  balanceDisplay,
  typicalShortCostDisplay,
}) => (
  <EmailLayout
    appName={appName}
    preview={`${title} is ready`}
    footerNote="Questions? Reply to this email."
  >
    <Section>
      <Heading as="h2" style={headingStyle}>
        {title} is ready
      </Heading>
      {posterUrl ? (
        <Img src={posterUrl} width="536" alt="" style={posterStyle} />
      ) : null}
      {clipMeta ? <Text style={paragraphStyle}>{clipMeta}</Text> : null}
      <Button href={watchUrl} style={buttonStyle}>
        Watch
      </Button>
      <Text style={paragraphStyle}>
        <Link href={creditsUrl} style={creditsLinkStyle}>
          {balanceDisplay} left · another short is about{' '}
          {typicalShortCostDisplay}
        </Link>
      </Text>
    </Section>
  </EmailLayout>
);

/** "Your video is ready" — one per sequence, reply-to us (#1276). */
export async function sendSequenceReadyEmail(params: {
  to: string;
  title: string;
  watchUrl: string;
  creditsUrl: string;
  posterUrl?: string;
  clipMeta?: string;
  balanceDisplay: string;
  typicalShortCostDisplay: string;
}): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: params.to,
    subject: `"${params.title}" is ready`,
    replyTo: CONTACT_EMAIL,
    body: (
      <SequenceReadyEmail
        appName={getAppName()}
        title={params.title}
        watchUrl={params.watchUrl}
        creditsUrl={params.creditsUrl}
        posterUrl={params.posterUrl}
        clipMeta={params.clipMeta}
        balanceDisplay={params.balanceDisplay}
        typicalShortCostDisplay={params.typicalShortCostDisplay}
      />
    ),
  });
}
