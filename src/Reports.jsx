import useReportForm from './useReportForm.js';

export default function ReportPage({ Topbar }) {
  const { form, status, isSubmitting, updateField, handleSubmit } = useReportForm();

  return (
    <main className="page-shell">
      <Topbar />

      <section className="report-page" aria-label="맛집 제보">
        <div className="report-copy">
          <p>맛집 제보</p>
          <h1>혼자 알기 아까운 식당을 알려주세요</h1>
          <span>
            식당 이름과 위치, 꼭 먹어야 하는 메뉴를 보내주시면 확인 후 맛집 데이터에 반영합니다.
          </span>
        </div>

        <form className="report-form" onSubmit={handleSubmit}>
          <label>
            식당 이름
            <input
              name="restaurantName"
              value={form.restaurantName}
              onChange={updateField}
              placeholder="예: 라멘모토"
              required
            />
          </label>

          <label>
            위치
            <input
              name="location"
              value={form.location}
              onChange={updateField}
              placeholder="예: 서울 서초구 신반포로 325"
              required
            />
          </label>

          <label>
            맛있게 먹었던 메뉴
            <input
              name="recommendedMenu"
              value={form.recommendedMenu}
              onChange={updateField}
              placeholder="예: 츠케멘, 곰탕, 간짜장"
              required
            />
          </label>

          <label>
            맛있었던 이유
            <textarea
              name="reason"
              value={form.reason}
              onChange={updateField}
              placeholder="웨이팅, 가격, 분위기, 추천 포인트 등을 자유롭게 적어주세요."
              rows="6"
            />
          </label>

          <div className="report-form-grid">
            <label>
              제보자 이름
              <input
                name="reporterName"
                value={form.reporterName}
                onChange={updateField}
                placeholder="선택"
              />
            </label>

            <label>
              답장 받을 이메일
              <input
                name="reporterEmail"
                type="email"
                value={form.reporterEmail}
                onChange={updateField}
                placeholder="선택"
              />
            </label>
          </div>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '보내는 중' : '제보 보내기'}
          </button>

          {status && <p className="report-status">{status}</p>}
        </form>
      </section>
    </main>
  );
}
