import { render, screen } from '@testing-library/angular';
import { VerdictBannerComponent } from './verdict-banner.component';
import { LucideAngularModule, OctagonX, CircleCheck, TriangleAlert } from 'lucide-angular';

describe('VerdictBannerComponent', () => {
  it('should show success state when there are no blockers', async () => {
    await render(VerdictBannerComponent, {
      componentInputs: {
        blockerCount: 0,
        exposeCount: 5
      },
      imports: [LucideAngularModule.pick({ OctagonX, CircleCheck })]
    });

    expect(screen.getByText('No blocking issues')).toBeInTheDocument();
    expect(screen.getByText('5 external services will be exposed.')).toBeInTheDocument();
  });

  it('should show danger state when there are blockers', async () => {
    await render(VerdictBannerComponent, {
      componentInputs: {
        blockerCount: 2,
        exposeCount: 5
      },
      imports: [LucideAngularModule.pick({ OctagonX, CircleCheck })]
    });

    expect(screen.getByText('2 blocking issues')).toBeInTheDocument();
    expect(screen.getByText(/Unsupported auth method .* on 2 services/)).toBeInTheDocument();
  });

  // Reviews refuse submit too, so the banner must never read clear over them.
  it('should show review state when there are only reviews', async () => {
    await render(VerdictBannerComponent, {
      componentInputs: {
        blockerCount: 0,
        reviewCount: 1,
        exposeCount: 5
      },
      imports: [LucideAngularModule.pick({ OctagonX, CircleCheck, TriangleAlert })]
    });

    expect(screen.getByText('1 service to review')).toBeInTheDocument();
    expect(screen.queryByText('No blocking issues')).toBeNull();
    expect(screen.getByText(/couldn't tell the auth method of 1 service\. Set it or exclude it/)).toBeInTheDocument();
  });

  it('should name the reviews alongside the blockers', async () => {
    await render(VerdictBannerComponent, {
      componentInputs: {
        blockerCount: 1,
        reviewCount: 2,
        exposeCount: 5
      },
      imports: [LucideAngularModule.pick({ OctagonX, CircleCheck, TriangleAlert })]
    });

    expect(screen.getByText('1 blocking issue')).toBeInTheDocument();
    expect(screen.getByText(/2 more services need an auth method set or excluding/)).toBeInTheDocument();
  });
});
