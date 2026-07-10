import { AcademyQuizQuestion } from '@ghostfolio/common/academy-curriculum';
import { AcademyQuizSubmissionResult } from '@ghostfolio/common/interfaces';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarkdownModule } from 'ngx-markdown';

/**
 * Presentational quiz block: renders multiple-choice/calculation questions,
 * collects answers, and emits them on submit. The correct answers and
 * explanations are never sent to the client until `result` is set by the
 * parent (after the real submission round-trips through the API) — the quiz
 * itself has no access to `correctAnswer`/`explanation` before that point.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MarkdownModule],
  selector: 'gf-academy-quiz',
  styleUrls: ['./academy-quiz.component.scss'],
  templateUrl: './academy-quiz.component.html'
})
export class GfAcademyQuizComponent implements OnChanges {
  @Input() questions: AcademyQuizQuestion[] = [];
  @Input() result: AcademyQuizSubmissionResult | null = null;

  @Output() submitAnswers = new EventEmitter<Record<string, string>>();

  protected answers: Record<string, string> = {};

  public ngOnChanges() {
    if (!this.result) {
      return;
    }

    // Keep the submitted answers visible alongside the revealed result.
    for (const { questionId } of this.result.results) {
      if (!(questionId in this.answers)) {
        this.answers[questionId] = this.result.answers[questionId] ?? '';
      }
    }
  }

  protected onSubmit() {
    this.submitAnswers.emit(this.answers);
  }

  protected resultFor(questionId: string) {
    return this.result?.results.find((r) => r.questionId === questionId) ?? null;
  }

  protected get allAnswered(): boolean {
    return (
      this.questions.length > 0 &&
      this.questions.every((q) => (this.answers[q.id] ?? '').trim().length > 0)
    );
  }
}
