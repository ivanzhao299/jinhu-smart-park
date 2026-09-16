import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApartmentApplicantFields, ApartmentApplicantDetails, applicantDetails } from '../../app/apartments/ApartmentApplicantFields';

describe('apartment applicant details', () => {
  it('renders labelled constrained fields and serializes all details', () => {
    const { container } = render(<form><ApartmentApplicantFields /></form>);
    for (const label of ['性别', '身份证号', '籍贯', '家庭住址', '健康状况（可选）', '紧急联系人与本人关系']) expect(screen.getByLabelText(label)).toBeTruthy();
    const form = container.querySelector('form')!;
    const values = { gender: 'female', identity_number: '11010119900101001x', native_place: '测试籍贯', home_address: '测试住址', health_status: '住宿相关测试', emergency_contact_relationship: '朋友' };
    for (const [key, value] of Object.entries(values)) (form.elements.namedItem(key) as HTMLInputElement).value = value;
    expect(applicantDetails(new FormData(form))).toEqual({ ...values, identity_number: values.identity_number.toUpperCase() });
    expect(form.checkValidity()).toBe(true);
    (form.elements.namedItem('identity_number') as HTMLInputElement).value = 'abc';
    expect(form.checkValidity()).toBe(false);
  });
  it('renders saved details and only the masked identity', () => {
    render(<div><ApartmentApplicantDetails row={{ gender: 'female', identity_number_masked: '11************1X', identity_number: 'must-not-render', native_place: '测试籍贯', home_address: '测试住址', health_status: '未说明', emergency_contact_relationship: '朋友' }} /></div>);
    expect(screen.getByText(/11\*+1X/)).toBeTruthy();
    expect(screen.getByText(/测试籍贯/)).toBeTruthy();
    expect(screen.queryByText(/must-not-render/)).toBeNull();
  });
});
