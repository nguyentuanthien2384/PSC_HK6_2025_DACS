import { getUser } from "../../utils/token";
import React, { useEffect, useRef, useState } from 'react';
import CommentBlog from '../../component/Blog/CommentBlog';
import CommentFormBlog from '../../component/Blog/CommentFormBlog';
import RightBlog from '../../component/Blog/RightBlog';
import {
  getDetailBlogByIdService, getAllCategoryBlogService, createNewcommentService,
  getAllcommentByBlogIdService, getFeatureBlog
} from '../../services/userService'
import { Link, useParams } from "react-router-dom";
import { toast } from 'react-toastify';
import moment from 'moment';
function DetailBlog(props) {
  const [dataSubject, setdataSubject] = useState([])
  const [dataComment, setdataComment] = useState([])
  const [dataBlog, setdataBlog] = useState(null)
  const { id } = useParams();
  const [user] = useState(() => getUser())
  const [dataFeatureBlog, setdataFeatureBlog] = useState([])
  const [loadError, setLoadError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [retry, setRetry] = useState(0)
  const [commentRevision, setCommentRevision] = useState(0)
  const commentBlogId = useRef(null)
  const scope = useRef(null)
  const sending = useRef(false)
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getAllCategoryBlogService('SUBJECT', { signal: controller.signal })
      .then(response => { if (active && response?.errCode === 0) setdataSubject(response.data || []); })
      .catch(() => {});
    getFeatureBlog(6, { signal: controller.signal })
      .then(response => { if (active && response?.errCode === 0) setdataFeatureBlog(response.data || []); })
      .catch(() => {});
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const currentScope = {};
    scope.current = currentScope;
    setdataBlog(null);
    setLoadError('');
    getDetailBlogByIdService(id, { signal: controller.signal })
      .then(response => {
        if (!active) return;
        if (response?.errCode !== 0 || !response.data) throw new Error(response?.errMessage || 'Không thể tải bài viết.');
        setdataBlog(response.data);
      })
      .catch(error => { if (active) setLoadError(error.message); });
    return () => { active = false; controller.abort(); if (scope.current === currentScope) scope.current = null; };
  }, [id, retry]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (commentBlogId.current !== id) {
      commentBlogId.current = id;
      setdataComment([]);
    }
    setCommentError('');
    getAllcommentByBlogIdService(id, { signal: controller.signal, fresh: commentRevision > 0 })
      .then(response => {
        if (!active) return;
        if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải bình luận.');
        setdataComment(Array.isArray(response.data) ? response.data : []);
      })
      .catch(error => { if (active) setCommentError(error.message); });
    return () => { active = false; controller.abort(); };
  }, [id, commentRevision]);

  let handleAddComment = async (content) => {
    if (sending.current) return;
    if (user && user.id) {
      const currentScope = scope.current;
      sending.current = true;
      try {
        const res = await createNewcommentService({ content, blogId: id, userId: user.id });
        if (scope.current !== currentScope) return;
        if (res?.errCode !== 0) throw new Error(res?.errMessage || 'Không thể đăng bình luận.');
        toast.success('Đăng bình luận thành công');
        setCommentRevision(value => value + 1);
      } catch (error) {
        if (scope.current === currentScope) toast.error(error.message);
      } finally { sending.current = false; }
    } else {
      toast.error("Hãy đăng nhập để bình luận")
    }
  }
  return (
    <>
      <section className="banner_area">
        <div className="banner_inner d-flex align-items-center">
          <div className="container">
            <div className="banner_content d-md-flex justify-content-between align-items-center">
              <div className="mb-3 mb-md-0">
                <h2>Chi tiết bài đăng</h2>
                <p>Theo dõi bài đăng để nhận thông tin mới nhất</p>
              </div>
              <div className="page_link">
                <Link to={"/"}>Trang chủ</Link>
                <Link to={"/blog"}>Tin tức</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="blog_area single-post-area section_gap">
        <div className="container">
          <div className="row">
            <div className="col-lg-8 posts-list">
              {loadError ? <p role="alert">{loadError} <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></p> :
                !dataBlog ? <p role="status">Đang tải bài viết…</p> : <>
              <div className="single-post">
                <div className="feature-img">
                  <img style={{ width: '100%', height: '514px', objectFit: 'cover' }} className="img-fluid" src={dataBlog.image} alt="" />
                </div>
                <div className="blog_details">
                  <h2>{dataBlog.title}</h2>
                  <ul className="blog-info-link mt-3 mb-4">
                    <li><a href="#"><i className="ti-user" /> {dataBlog.userData && dataBlog.userData.firstName + " " + dataBlog.userData.lastName}</a></li>
                    <li><a href="#"><i className="ti-comments" /> {dataComment.length} Bình luận</a></li>
                  </ul>
                  <div className="quote-wrapper">
                    <div className="quotes">
                      {dataBlog.shortdescription}
                    </div>
                  </div>
                  <p dangerouslySetInnerHTML={{ __html: dataBlog.contentHTML }} className="excert">

                  </p>

                </div>
              </div>

              <div className="comments-area">
                {commentError && <p role="alert">{commentError} <button type="button" onClick={() => setCommentRevision(value => value + 1)}>Thử lại bình luận</button></p>}
                <h4>{dataComment.length} Bình luận</h4>
                {dataComment && dataComment.length > 0 &&
                  dataComment.map((item, index) => {
                    if (item.user) {
                      let name = item.user.firstName + " " + item.user.lastName
                      return (
                        <CommentBlog img={item.user.image} name={name} content={item.content} key={index}
                          date={moment(item.createdAt).fromNow()}
                        />
                      )
                    }

                  })
                }


              </div>
              <CommentFormBlog handleAddComment={handleAddComment} />
              </>}
            </div>
            <RightBlog dataFeatureBlog={dataFeatureBlog} isPage={false} data={dataSubject}></RightBlog>
          </div>
        </div>
      </section>
    </>


  );
}

export default DetailBlog;
